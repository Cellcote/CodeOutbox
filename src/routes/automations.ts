// Authd config endpoints for the win-back + RSS-to-email automations.
//   GET/PUT/DELETE /v1/groups/:slug/winback   ({ subject, body, days })
//   GET/PUT/DELETE /v1/groups/:slug/rss        ({ url })

import type { Context } from "hono";
import { getAccountId } from "../auth";
import { getWinback, setWinback, clearWinback } from "../winback";
import { getRss, setRss, clearRss } from "../rss";

export async function getWinbackEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const winback = await getWinback(accountId, c.req.param("slug") ?? "");
  return c.json({ ok: true, winback });
}

export async function setWinbackEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const md = String(body.body ?? "").trim();
  if (!md) return c.json({ ok: false, error: "body is required" }, 400);
  const days = Number(body.days) > 0 ? Math.floor(Number(body.days)) : 60;
  const ok = await setWinback(
    accountId,
    c.req.param("slug") ?? "",
    String(body.subject ?? "").trim(),
    md,
    days,
  );
  if (!ok) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true });
}

export async function deleteWinbackEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const ok = await clearWinback(accountId, c.req.param("slug") ?? "");
  if (!ok) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true });
}

export async function getRssEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const rss = await getRss(accountId, c.req.param("slug") ?? "");
  return c.json({ ok: true, rss });
}

export async function setRssEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return c.json({ ok: false, error: "url must be an http(s) feed URL" }, 400);
  }
  const ok = await setRss(accountId, c.req.param("slug") ?? "", url);
  if (!ok) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true });
}

export async function deleteRssEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const ok = await clearRss(accountId, c.req.param("slug") ?? "");
  if (!ok) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true });
}
