// Authd API-trigger endpoints (wrapped by `co triggers`).
//   GET    /v1/triggers          → list event templates
//   PUT    /v1/triggers/:event   → set { subject, body }
//   DELETE /v1/triggers/:event   → remove
//   POST   /v1/trigger           → fire { event, email, data } → send

import type { Context } from "hono";
import { getAccountId } from "../auth";
import {
  listTriggers,
  setTrigger,
  removeTrigger,
  fireTrigger,
} from "../triggers";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function listTriggersEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  return c.json({ ok: true, triggers: await listTriggers(accountId) });
}

export async function setTriggerEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const event = (c.req.param("event") ?? "").trim();
  if (!event) return c.json({ ok: false, error: "event is required" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim();
  const md = String(body.body ?? "").trim();
  if (!md) return c.json({ ok: false, error: "body is required" }, 400);
  await setTrigger(accountId, event, subject || "Hello", md);
  return c.json({ ok: true });
}

export async function deleteTriggerEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const ok = await removeTrigger(accountId, (c.req.param("event") ?? "").trim());
  if (!ok) return c.json({ ok: false, error: "trigger not found" }, 404);
  return c.json({ ok: true });
}

export async function fireTriggerEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const event = String(body.event ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!event || !EMAIL.test(email)) {
    return c.json({ ok: false, error: "event and a valid email are required" }, 400);
  }
  try {
    const r = await fireTrigger(accountId, event, email, body.data ?? {});
    return r.sent
      ? c.json({ ok: true })
      : c.json({ ok: false, error: r.error }, 404);
  } catch (err) {
    return c.json({ ok: false, error: String((err as Error).message) }, 400);
  }
}
