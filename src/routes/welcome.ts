// Authd welcome-email endpoints (wrapped by `co welcome` + the dashboard editor).
//   GET    /v1/groups/:slug/welcome → the list's welcome letter (or null)
//   PUT    /v1/groups/:slug/welcome → set { subject, body }
//   DELETE /v1/groups/:slug/welcome → turn it off

import type { Context } from "hono";
import { getAccountId } from "../auth";
import { getWelcome, setWelcome, clearWelcome } from "../welcome";

export async function getWelcomeEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const welcome = await getWelcome(accountId, c.req.param("slug") ?? "");
  return c.json({ ok: true, welcome });
}

export async function setWelcomeEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim();
  const md = String(body.body ?? "").trim();
  if (!md) return c.json({ ok: false, error: "body is required" }, 400);
  const ok = await setWelcome(accountId, c.req.param("slug") ?? "", subject, md);
  if (!ok) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true });
}

export async function deleteWelcomeEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const ok = await clearWelcome(accountId, c.req.param("slug") ?? "");
  if (!ok) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true });
}
