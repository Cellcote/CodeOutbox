// GET /v1/usage — current plan + subscriber/send usage against the limits.

import type { Context } from "hono";
import { getAccountId } from "../auth";
import { getUsage } from "../usage";

export async function usageEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  return c.json({ ok: true, ...(await getUsage(accountId)) });
}
