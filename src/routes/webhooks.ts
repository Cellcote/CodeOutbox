// Authd tenant-webhook management (wrapped by `co webhooks`).
//   GET    /v1/webhooks       → list endpoints
//   POST   /v1/webhooks       → add endpoint, returns the signing secret (once)
//   DELETE /v1/webhooks/:id    → remove endpoint

import type { Context } from "hono";
import { getAccountId } from "../auth";
import {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  WEBHOOK_EVENTS,
} from "../webhooks";

export async function listWebhooksEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  return c.json({
    ok: true,
    webhooks: await listWebhooks(accountId),
    available_events: WEBHOOK_EVENTS,
  });
}

export async function createWebhookEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!/^https:\/\//i.test(url)) {
    return c.json({ ok: false, error: "url must be an https URL" }, 400);
  }
  const events = Array.isArray(body.events) ? body.events.map(String) : undefined;
  const { id, secret, events: ev } = await createWebhook(accountId, url, events);
  return c.json({
    ok: true,
    id,
    url,
    events: ev,
    secret,
    note: "Store this secret — it verifies the X-CO-Signature header and won't be shown again.",
  });
}

export async function deleteWebhookEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const ok = await deleteWebhook(accountId, id);
  return c.json(ok ? { ok: true } : { ok: false, error: "not found" }, ok ? 200 : 404);
}
