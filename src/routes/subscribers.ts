// Programmatic subscriber API (authd). This is how a SaaS pushes its own users —
// the thing that makes "register and send" easy without a form.
//   GET    /v1/groups/:group/subscribers
//   POST   /v1/groups/:group/subscribers          { email, name?, confirmed? }
//   POST   /v1/groups/:group/subscribers/import    { subscribers:[...], confirmed? }
//   DELETE /v1/groups/:group/subscribers/:email
//
// `confirmed: true` asserts the SaaS already has consent (no opt-in email). Without
// it, the subscriber is pending and gets a double-opt-in email (when the list requires it).

import type { Context } from "hono";
import { query, queryOne } from "../db";
import { getAccountId } from "../auth";
import { signToken } from "../tokens";
import { sendSystemEmail } from "../sender";
import { confirmEmail } from "../email/templates";
import { subscriberUsage } from "../usage";
import { config } from "../config";

async function existsInList(listId: number, email: string): Promise<boolean> {
  const r = await queryOne<{ x: number }>(
    `SELECT 1 AS x FROM subscribers WHERE group_id = $1 AND email = $2`,
    [listId, email],
  );
  return !!r;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMPORT = 1000;

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
): Promise<string> {
  const sub = await queryOne<{ id: number; status: string }>(
    `INSERT INTO subscribers (group_id, email, name, status, source)
     VALUES ($1, $2, $3, 'pending', 'api')
     ON CONFLICT (group_id, email)
       DO UPDATE SET name = COALESCE(EXCLUDED.name, subscribers.name)
     RETURNING id, status`,
    [list.id, email, name],
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
  const token = await signToken(sub.id, "confirm");
  await sendSystemEmail(confirmEmail(email, `${config.baseUrl}/confirm/${token}`));
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

  const status = await upsertSubscriber(list, email, name, body.confirmed === true);
  return c.json({ ok: true, email, status });
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
  const confirmed = body.confirmed === true;

  // Plan: cap how many NEW subscribers this import can add.
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
    await upsertSubscriber(list, email, r?.name != null ? String(r.name) : null, confirmed);
    added++;
  }
  return c.json({ ok: true, added, skipped, capped });
}

export async function listSubscribers(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const list = await resolveList(c.req.param("group"), accountId);
  if (!list) return c.json({ ok: false, error: "list not found" }, 404);

  const limit = Math.min(Number(c.req.query("limit") ?? 100), 1000);
  const subscribers = await query<{
    email: string;
    status: string;
    created_at: string;
  }>(
    `SELECT email, status, created_at FROM subscribers
      WHERE group_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [list.id, limit],
  );
  return c.json({ ok: true, subscribers });
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
