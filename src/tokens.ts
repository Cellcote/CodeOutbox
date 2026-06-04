// Signed, single-purpose, expiring tokens (HS256 JWT via Hono's jwt helpers).
// Used for double-opt-in confirmation links. Other purposes (unsubscribe, claim,
// magic-link) will reuse this same shape.

import { sign, verify } from "hono/jwt";
import { config } from "./config";

export type TokenPurpose = "confirm" | "unsubscribe" | "claim" | "magic";

interface TokenPayload {
  sub: string; // subscriber id (as string)
  purpose: TokenPurpose;
  exp: number; // unix seconds
}

const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function signToken(
  subscriberId: number | string,
  purpose: TokenPurpose,
  ttlSeconds = SEVEN_DAYS,
): Promise<string> {
  const payload = {
    sub: String(subscriberId),
    purpose,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  return sign(payload, config.tokenSecret, "HS256");
}

// Returns the payload, or null if the token is invalid/expired/wrong purpose.
export async function verifyToken(
  token: string,
  expected: TokenPurpose,
): Promise<TokenPayload | null> {
  try {
    const payload = (await verify(
      token,
      config.tokenSecret,
      "HS256",
    )) as unknown as TokenPayload;
    if (payload.purpose !== expected) return null;
    return payload;
  } catch {
    return null;
  }
}
