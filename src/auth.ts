// Resolve the signed-in account for authd endpoints. Accepts either the session
// cookie (browser/dashboard) or an Authorization: Bearer <session> header (CLI).

import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession } from "./tokens";
import { verifyApiToken } from "./apitokens";

export async function getAccountId(c: Context): Promise<number | null> {
  const cookie = getCookie(c, "co_session");
  if (cookie) {
    const id = await verifySession(cookie);
    if (id) return id;
  }
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) {
    const presented = auth.slice(7);
    // Prefer API tokens; fall back to a session token used as a Bearer.
    const apiId = await verifyApiToken(presented);
    if (apiId) return apiId;
    const sessionId = await verifySession(presented);
    if (sessionId) return sessionId;
  }
  return null;
}
