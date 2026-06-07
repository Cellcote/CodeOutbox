// POST /webhooks/email-event — the MTA's bounce/complaint pipe posts here. The VERP
// return-path identifies the exact subscriber+broadcast; we mark them and suppress.
// Authenticated by a shared secret (X-CO-Event-Secret) so only our MTA can call it.

import type { Context } from "hono";
import { query, queryOne } from "../db";
import { parseVerp } from "../verp";
import { config } from "../config";
import { emitEvent } from "../webhooks";

export async function emailEvent(c: Context) {
  // Shared-secret auth (the MTA pipe sets this header).
  const secret = config.send.bounceSecret;
  if (secret && c.req.header("x-co-event-secret") !== secret) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const type = body.type === "complaint" ? "complained" : "bounced";
  const parsed = parseVerp(String(body.verp ?? ""));
  if (!parsed) return c.json({ ok: false, error: "invalid or unsigned verp" }, 400);

  const sub = await queryOne<{ email: string; owner_account_id: number | null }>(
    `SELECT s.email, g.owner_account_id
       FROM subscribers s JOIN groups g ON g.id = s.group_id
      WHERE s.id = $1`,
    [parsed.subscriberId],
  );
  if (!sub) return c.json({ ok: false, error: "subscriber not found" }, 404);

  // Don't override an explicit unsubscribe.
  await query(
    `UPDATE subscribers SET status = $2
      WHERE id = $1 AND status <> 'unsubscribed'`,
    [parsed.subscriberId, type],
  );

  if (sub.owner_account_id) {
    await query(
      `INSERT INTO suppressions (account_id, email, reason)
       VALUES ($1, $2, $3) ON CONFLICT (account_id, email) DO NOTHING`,
      [sub.owner_account_id, sub.email, type === "complained" ? "complaint" : "bounce"],
    );
  }

  emitEvent(sub.owner_account_id, `subscriber.${type}`, {
    email: sub.email,
    broadcastId: parsed.broadcastId,
  });

  // Bump the broadcast's aggregate (column name is from a fixed whitelist).
  const col = type === "complained" ? "complained_count" : "bounced_count";
  await query(
    `UPDATE broadcasts SET ${col} = ${col} + 1 WHERE id = $1`,
    [parsed.broadcastId],
  );

  return c.json({ ok: true, type, email: sub.email });
}
