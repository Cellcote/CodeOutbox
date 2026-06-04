// Authd API-token management. Create returns the plaintext token exactly once.

import type { Context } from "hono";
import { getAccountId } from "../auth";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "../apitokens";

export async function createTokenEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? "api token").slice(0, 80);
  const { id, token } = await createApiToken(accountId, name);
  return c.json({
    ok: true,
    id,
    name,
    token,
    note: "store this now — it won't be shown again",
  });
}

export async function listTokensEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const tokens = await listApiTokens(accountId);
  return c.json({ ok: true, tokens });
}

export async function revokeTokenEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) {
    return c.json({ ok: false, error: "invalid id" }, 400);
  }
  const ok = await revokeApiToken(accountId, id);
  if (!ok) return c.json({ ok: false, error: "token not found" }, 404);
  return c.json({ ok: true, revoked: id });
}
