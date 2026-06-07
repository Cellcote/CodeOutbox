// Tenant event webhooks. When a subscriber lifecycle event happens, POST a signed
// JSON payload to the account's registered endpoints so their app/agent can react.
// Signature: X-CO-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>.
// Delivery is fire-and-forget with a short timeout — never blocks the request.

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { query, queryOne } from "./db";

export const WEBHOOK_EVENTS = [
  "subscriber.confirmed",
  "subscriber.unsubscribed",
  "subscriber.bounced",
  "subscriber.complained",
] as const;

export interface WebhookRow {
  id: number;
  url: string;
  events: string; // "*" or comma-separated event names
  active: boolean;
  created_at: string;
}

function normalizeEvents(events?: string[]): string {
  if (!events || !events.length) return "*";
  const allow = WEBHOOK_EVENTS as readonly string[];
  const valid = events.map((e) => e.trim()).filter((e) => allow.includes(e));
  return valid.length ? valid.join(",") : "*";
}

export async function createWebhook(
  accountId: number,
  url: string,
  events?: string[],
): Promise<{ id: number; secret: string; events: string }> {
  const secret = "cohook_" + randomBytes(24).toString("hex");
  const ev = normalizeEvents(events);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO webhooks (account_id, url, secret, events)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [accountId, url, secret, ev],
  );
  if (!row) throw new Error("failed to create webhook");
  return { id: row.id, secret, events: ev };
}

export async function listWebhooks(accountId: number): Promise<WebhookRow[]> {
  return query<WebhookRow>(
    `SELECT id, url, events, active, created_at
       FROM webhooks WHERE account_id = $1 ORDER BY id`,
    [accountId],
  );
}

export async function deleteWebhook(
  accountId: number,
  id: number,
): Promise<boolean> {
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM webhooks WHERE id = $1 AND account_id = $2`,
    [id, accountId],
  );
  if (!existing) return false;
  await query(`DELETE FROM webhooks WHERE id = $1 AND account_id = $2`, [
    id,
    accountId,
  ]);
  return true;
}

function subscribedTo(events: string, type: string): boolean {
  return events === "*" || events.split(",").includes(type);
}

async function deliver(
  accountId: number,
  type: string,
  data: unknown,
): Promise<void> {
  const hooks = await query<{ url: string; secret: string; events: string }>(
    `SELECT url, secret, events FROM webhooks WHERE account_id = $1 AND active = TRUE`,
    [accountId],
  );
  const targets = hooks.filter((h) => subscribedTo(h.events, type));
  if (!targets.length) return;

  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: randomUUID(),
    type,
    created: new Date(ts * 1000).toISOString(),
    data,
  });

  await Promise.all(
    targets.map(async (h) => {
      const sig = createHmac("sha256", h.secret)
        .update(`${ts}.${body}`)
        .digest("hex");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        await fetch(h.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-CO-Event": type,
            "X-CO-Signature": `t=${ts},v1=${sig}`,
          },
          body,
          signal: ctrl.signal,
        });
      } catch (e) {
        console.error(`webhook delivery to ${h.url} failed:`, (e as Error).message);
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

// Fire-and-forget — never throws into or blocks the caller.
export function emitEvent(
  accountId: number | null | undefined,
  type: string,
  data: unknown,
): void {
  if (!accountId) return;
  deliver(accountId, type, data).catch((e) =>
    console.error("emitEvent error:", e),
  );
}
