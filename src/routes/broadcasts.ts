// Authd broadcast endpoints. The CLI and (later) MCP are thin clients of these.
//   POST /v1/broadcasts/preview  → render + recipient count + spam-lint, sends nothing
//   POST /v1/broadcasts          → send (requires { confirm: true }; otherwise dry-run)

import type { Context } from "hono";
import { getAccountId } from "../auth";
import {
  previewBroadcast,
  sendBroadcast,
  listBroadcasts,
  sendTest,
} from "../broadcast";

export async function listBroadcastsEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  return c.json({ ok: true, broadcasts: await listBroadcasts(accountId) });
}

export async function testBroadcastEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  try {
    return c.json({ ok: true, ...(await sendTest(String(body.source ?? ""), accountId)) });
  } catch (err) {
    return c.json({ ok: false, error: String((err as Error).message) }, 400);
  }
}

export async function previewBroadcastEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const source = String(body.source ?? "");
  try {
    const res = await previewBroadcast(source, accountId);
    return c.json({ ok: true, dryRun: true, ...res });
  } catch (err) {
    return c.json({ ok: false, error: String((err as Error).message) }, 400);
  }
}

export async function sendBroadcastEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const source = String(body.source ?? "");

  // Safety: never send without explicit confirmation — return a preview instead.
  if (body.confirm !== true) {
    try {
      const res = await previewBroadcast(source, accountId);
      return c.json({ ok: true, dryRun: true, ...res });
    } catch (err) {
      return c.json({ ok: false, error: String((err as Error).message) }, 400);
    }
  }

  try {
    const res = await sendBroadcast(source, accountId);
    return c.json({ ok: true, dryRun: false, ...res });
  } catch (err) {
    return c.json({ ok: false, error: String((err as Error).message) }, 400);
  }
}
