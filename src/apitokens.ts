// API tokens for CLI/MCP auth. The plaintext token is shown once at creation; we
// only ever store its SHA-256 hash. Presented tokens are hashed and looked up.

import { createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "./db";

const PREFIX = "co_live_";

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(PREFIX);
}

export async function createApiToken(
  accountId: number,
  name: string,
): Promise<{ id: number; token: string }> {
  const token = PREFIX + randomBytes(24).toString("base64url");
  const row = await queryOne<{ id: number }>(
    `INSERT INTO api_tokens (account_id, name, hash) VALUES ($1, $2, $3) RETURNING id`,
    [accountId, name, hashToken(token)],
  );
  if (!row) throw new Error("failed to create token");
  return { id: row.id, token };
}

// Returns the owning account id for a valid, non-revoked token (and touches
// last_used_at), or null.
export async function verifyApiToken(plain: string): Promise<number | null> {
  if (!looksLikeApiToken(plain)) return null;
  const hash = hashToken(plain);
  const row = await queryOne<{ account_id: number }>(
    `SELECT account_id FROM api_tokens WHERE hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
  if (!row) return null;
  await query(`UPDATE api_tokens SET last_used_at = now() WHERE hash = $1`, [
    hash,
  ]);
  return Number(row.account_id);
}

export async function listApiTokens(accountId: number) {
  return query<{
    id: number;
    name: string | null;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>(
    `SELECT id, name, created_at, last_used_at, revoked_at
       FROM api_tokens WHERE account_id = $1 ORDER BY id`,
    [accountId],
  );
}

export async function revokeApiToken(
  accountId: number,
  id: number,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `UPDATE api_tokens SET revoked_at = now()
      WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [id, accountId],
  );
  return !!row;
}
