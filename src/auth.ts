// Resolve the signed-in account for authd endpoints. Accepts either the session
// cookie (browser/dashboard) or an Authorization: Bearer <session> header (CLI).

import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession } from "./tokens";

export async function getAccountId(c: Context): Promise<number | null> {
  const cookie = getCookie(c, "co_session");
  if (cookie) {
    const id = await verifySession(cookie);
    if (id) return id;
  }
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) {
    const id = await verifySession(auth.slice(7));
    if (id) return id;
  }
  return null;
}
