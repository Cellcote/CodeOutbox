// Programmatic subscriber API (authd). This is how a SaaS pushes its own users —
// the thing that makes "register and send" easy without a form.
//   GET    /v1/groups/:group/subscribers
//   GET    /v1/groups/:group/subscribers/export    ?format=csv|json (everything, incl. fields)
//   POST   /v1/groups/:group/subscribers          { email, name?, fields?, confirmed? }
//   POST   /v1/groups/:group/subscribers/import    { subscribers:[...], confirmed? }
//   POST   /v1/groups/:group/subscribers/import-csv { csv, confirmed }  (another tool's export)
//
// Custom fields (merge tags) come from `fields: {...}`; on import, any other keys on a
// row are treated as fields too, so a parsed CSV row can be posted as-is.
//   DELETE /v1/groups/:group/subscribers/:email
//
// `confirmed: true` asserts the SaaS already has consent (no opt-in email). Without
// it, the subscriber is pending and gets a double-opt-in email (when the list requires it).

import type { Context } from "hono";
import { query, queryOne } from "../db";
import { getAccountId } from "../auth";
import { subscriberUsage } from "../usage";
import { cleanFields, type Fields } from "../merge";
import { sendOptIn } from "../optin";
import { csvToSubscribers } from "../csv";

async function existsInList(listId: number, email: string): Promise<boolean> {
  const r = await queryOne<{ x: number }>(
    `SELECT 1 AS x FROM subscribers WHERE group_id = $1 AND email = $2`,
    [listId, email],
  );
  return !!r;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMPORT = 1000;
const MAX_CSV_ROWS = 20000;

interface List {
  id: number;
  double_opt_in: boolean;
}

async function resolveList(
  ref: string | undefined,
  accountId: number,
): Promise<List | null> {
  if (!ref) return null;
  return queryOne<List>(
    `SELECT id, double_opt_in FROM groups
      WHERE owner_account_id = $1 AND (slug = $2 OR public_id = $2)
      LIMIT 1`,
    [accountId, ref],
  );
}

// Add or update one subscriber; returns the resulting status.
async function upsertSubscriber(
  list: List,
  email: string,
  name: string | null,
  confirmed: boolean,
  fields: Fields = {},
): Promise<string> {
  const sub = await queryOne<{ id: number; status: string }>(
    `INSERT INTO subscribers (group_id, email, name, status, source, fields)
     VALUES ($1, $2, $3, 'pending', 'api', $4::jsonb)
     ON CONFLICT (group_id, email)
       DO UPDATE SET name = COALESCE(EXCLUDED.name, subscribers.name),
                     fields = subscribers.fields || EXCLUDED.fields
     RETURNING id, status`,
    [list.id, email, name, JSON.stringify(fields)],
  );
  if (!sub) throw new Error("upsert failed");

  if (sub.status === "confirmed" || sub.status === "unsubscribed") {
    return sub.status; // don't resurrect or re-confirm
  }

  // SaaS asserts consent, or the list doesn't require double opt-in → confirm now.
  if (confirmed || !list.double_opt_in) {
    await query(
      `UPDATE subscribers SET status = 'confirmed',
              consent_timestamp = COALESCE(consent_timestamp, now())
        WHERE id = $1`,
      [sub.id],
    );
    return "confirmed";
  }

  // Otherwise send (or re-send) the double-opt-in email.
  await sendOptIn(sub.id);
  return "pending";
}

export async function addSubscriber(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const list = await resolveList(c.req.param("group"), accountId);
  if (!list) return c.json({ ok: false, error: "list not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return c.json({ ok: false, error: "valid email required" }, 400);
  }
  const name = body.name != null ? String(body.name) : null;

  // Plan: subscriber cap (only blocks NEW subscribers).
  if (!(await existsInList(list.id, email))) {
    const su = await subscriberUsage(accountId);
    if (su.used >= su.limit) {
      return c.json(
        { ok: false, error: "subscriber limit reached — upgrade your plan" },
        402,
      );
    }
  }

  const status = await upsertSubscriber(
    list,
    email,
    name,
    body.confirmed === true,
    cleanFields(body.fields),
  );
  return c.json({ ok: true, email, status });
}

// Shared by the JSON and CSV imports: plan cap on NEW subscribers, upsert the rest.
async function importRows(list: List, accountId: number, rows: any[], confirmed: boolean) {
  const su = await subscriberUsage(accountId);
  let remaining = Number.isFinite(su.limit) ? su.limit - su.used : Infinity;

  let added = 0;
  let skipped = 0;
  let capped = 0;
  for (const r of rows) {
    const email = String(r?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    if (!(await existsInList(list.id, email))) {
      if (remaining <= 0) {
        capped++;
        continue;
      }
      remaining--;
    }
    const { fields: f, confirmed: _c, ...extra } = r ?? {}; // email/name: reserved, dropped by cleanFields
    await upsertSubscriber(
      list,
      email,
      r?.name != null && String(r.name).trim() ? String(r.name).trim() : null,
      confirmed,
      cleanFields({ ...extra, ...(f && typeof f === "object" ? f : {}) }),
    );
    added++;
  }
  return { added, skipped, capped };
}

export async function importSubscribers(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const list = await resolveList(c.req.param("group"), accountId);
  if (!list) return c.json({ ok: false, error: "list not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const rows: any[] = Array.isArray(body.subscribers) ? body.subscribers : [];
  if (!rows.length) return c.json({ ok: false, error: "subscribers[] required" }, 400);
  if (rows.length > MAX_IMPORT) {
    return c.json({ ok: false, error: `max ${MAX_IMPORT} per import` }, 400);
  }
  return c.json({ ok: true, ...(await importRows(list, accountId, rows, body.confirmed === true)) });
}

// POST /v1/groups/:group/subscribers/import-csv { csv, confirmed }
// The CSV export of another tool, as-is: headers are mapped (Email Address, First
// Name, Status…), unsubscribed/bounced rows are left out, extra columns → fields.
// `confirmed` must be stated explicitly: true (they opted in elsewhere) or false
// (send each new subscriber a confirmation email).
export async function importCsvEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const list = await resolveList(c.req.param("group"), accountId);
  if (!list) return c.json({ ok: false, error: "list not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  if (typeof body.confirmed !== "boolean") {
    return c.json(
      { ok: false, error: "say whether they already opted in: confirmed true (no email) or false (send a confirmation)" },
      400,
    );
  }
  let mapped;
  try {
    mapped = csvToSubscribers(String(body.csv ?? ""));
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 400);
  }
  if (!mapped.rows.length) return c.json({ ok: false, error: "no subscribers found in that file" }, 400);
  if (mapped.rows.length > MAX_CSV_ROWS) {
    return c.json({ ok: false, error: `that file has ${mapped.rows.length} rows; the limit per import is ${MAX_CSV_ROWS}` }, 400);
  }
  const res = await importRows(list, accountId, mapped.rows, body.confirmed);
  return c.json({ ok: true, ...res, inactive: mapped.inactive, columns: mapped.columns });
}

export async function listSubscribers(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const list = await resolveList(c.req.param("group"), accountId);
  if (!list) return c.json({ ok: false, error: "list not found" }, 404);

  const limit = Math.min(Number(c.req.query("limit") ?? 100), 1000);
  const subscribers = await query<{
    email: string;
    name: string | null;
    status: string;
    fields: Fields;
    created_at: string;
  }>(
    `SELECT email, name, status, fields, created_at FROM subscribers
      WHERE group_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [list.id, limit],
  );
  return c.json({ ok: true, subscribers });
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote when needed; prefix formula-looking cells so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportSubscribers(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const ref = c.req.param("group");
  const list = await resolveList(ref, accountId);
  if (!list) return c.json({ ok: false, error: "list not found" }, 404);

  const rows = await query<{
    email: string;
    name: string | null;
    status: string;
    source: string | null;
    fields: Fields;
    created_at: string;
  }>(
    `SELECT email, name, status, source, fields, created_at FROM subscribers
      WHERE group_id = $1 ORDER BY id`,
    [list.id],
  );

  if (c.req.query("format") === "json") {
    return c.json({ ok: true, subscribers: rows });
  }
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.fields ?? {})))].sort();
  const header = ["email", "name", "status", "source", "created_at", ...keys];
  const lines = rows.map((r) =>
    [
      r.email,
      r.name,
      r.status,
      r.source,
      new Date(r.created_at).toISOString(),
      ...keys.map((k) => r.fields?.[k]),
    ]
      .map(csvCell)
      .join(","),
  );
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename="${ref}-subscribers.csv"`);
  return c.body([header.join(","), ...lines].join("\n") + "\n");
}

export async function removeSubscriber(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const list = await resolveList(c.req.param("group"), accountId);
  if (!list) return c.json({ ok: false, error: "list not found" }, 404);

  const emailParam = c.req.param("email");
  if (!emailParam) return c.json({ ok: false, error: "email required" }, 400);
  const email = decodeURIComponent(emailParam).trim().toLowerCase();
  const row = await queryOne<{ id: number }>(
    `UPDATE subscribers SET status = 'unsubscribed'
      WHERE group_id = $1 AND email = $2 AND status <> 'unsubscribed'
      RETURNING id`,
    [list.id, email],
  );
  await query(
    `INSERT INTO suppressions (account_id, email, reason)
     VALUES ($1, $2, 'api-remove') ON CONFLICT (account_id, email) DO NOTHING`,
    [accountId, email],
  );
  return c.json({ ok: true, removed: !!row, email });
}
