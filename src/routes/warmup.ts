// GET /v1/warmup — current IP-warmup day, today's cap, usage, and remaining.

import type { Context } from "hono";
import { getAccountId } from "../auth";
import { warmupStatus } from "../warmup";

export async function warmupEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  return c.json({ ok: true, warmup: await warmupStatus() });
}
