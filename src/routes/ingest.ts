// POST /f/:group — the form endpoint. Validates, stores the subscriber as
// pending, and sends a double-opt-in confirmation email.

import type { Context } from "hono";
import { query, queryOne } from "../db";
import { signToken } from "../tokens";
import { sendSystemEmail } from "../sender";
import { confirmEmail } from "../email/templates";
import { subscriberUsage } from "../usage";
import { triggerWelcome } from "../welcome";
import { config } from "../config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Group {
  id: number;
  slug: string;
  double_opt_in: boolean;
  redirect: string | null;
  owner_account_id: number | null;
}

interface SubRow {
  id: number;
  status: string;
}

export async function ingest(c: Context) {
  const ref = c.req.param("group"); // a public_id (preferred) or a slug
  const ctype = c.req.header("content-type") ?? "";
  const wantsJson = (c.req.header("accept") ?? "").includes("application/json");

  // Accept both JSON and urlencoded/multipart form bodies.
  const body: Record<string, any> = ctype.includes("application/json")
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody();

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = body.name ? String(body.name).trim() : null;
  const honeypot = body._gotcha;

  const ok = (status: string, redirect?: string | null) =>
    wantsJson
      ? c.json({ ok: true, status })
      : c.redirect(redirect || "/thanks", 303);

  // Honeypot filled → silently succeed, create nothing.
  if (honeypot) return ok("pending");

  if (!EMAIL_RE.test(email)) {
    return wantsJson
      ? c.json({ ok: false, error: "invalid email" }, 400)
      : c.html("Invalid email address", 400);
  }

  const group = await queryOne<Group>(
    `SELECT id, slug, double_opt_in, redirect, owner_account_id FROM groups
      WHERE public_id = $1 OR slug = $1
      ORDER BY (public_id = $1) DESC
      LIMIT 1`,
    [ref],
  );
  if (!group) return c.notFound();

  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    null;

  // Plan: subscriber cap. Only blocks NEW subscribers; existing ones keep working.
  if (group.owner_account_id) {
    const existing = await queryOne<{ x: number }>(
      `SELECT 1 AS x FROM subscribers WHERE group_id = $1 AND email = $2`,
      [group.id, email],
    );
    if (!existing) {
      const su = await subscriberUsage(group.owner_account_id);
      if (su.used >= su.limit) {
        return wantsJson
          ? c.json({ ok: false, error: "subscriber limit reached" }, 402)
          : c.html("This list is full — the owner needs to upgrade.", 402);
      }
    }
  }

  // Upsert. On conflict we keep the existing status (so we don't downgrade a
  // confirmed subscriber back to pending).
  const sub = await queryOne<SubRow>(
    `INSERT INTO subscribers (group_id, email, name, status, consent_ip, source)
     VALUES ($1, $2, $3, 'pending', $4, 'form')
     ON CONFLICT (group_id, email)
       DO UPDATE SET name = COALESCE(EXCLUDED.name, subscribers.name)
     RETURNING id, status`,
    [group.id, email, name, ip],
  );
  if (!sub) return c.json({ ok: false, error: "store failed" }, 500);

  // Single opt-in group: confirm immediately, no email.
  if (!group.double_opt_in) {
    await query(
      `UPDATE subscribers SET status = 'confirmed', consent_timestamp = now()
       WHERE id = $1 AND status <> 'unsubscribed'`,
      [sub.id],
    );
    await triggerWelcome(sub.id, group.id);
    return ok("confirmed", group.redirect);
  }

  // Already confirmed → don't resend the opt-in.
  if (sub.status === "confirmed") return ok("confirmed", group.redirect);

  // Send (or re-send) the double-opt-in confirmation.
  const token = await signToken(sub.id, "confirm");
  const confirmUrl = `${config.baseUrl}/confirm/${token}`;
  await sendSystemEmail(confirmEmail(email, confirmUrl));

  return ok("pending", group.redirect);
}
