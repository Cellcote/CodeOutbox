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
const THIRTY_DAYS = 60 * 60 * 24 * 30;
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

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

// Claim tokens carry the group + the claimant's email (not a subscriber id).
export async function signClaim(
  groupId: number,
  email: string,
  ttlSeconds = SEVEN_DAYS,
): Promise<string> {
  return sign(
    {
      purpose: "claim",
      gid: String(groupId),
      email,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    },
    config.tokenSecret,
    "HS256",
  );
}

export async function verifyClaim(
  token: string,
): Promise<{ gid: number; email: string } | null> {
  try {
    const p = (await verify(token, config.tokenSecret, "HS256")) as any;
    if (p.purpose !== "claim") return null;
    return { gid: Number(p.gid), email: String(p.email) };
  } catch {
    return null;
  }
}

// Session tokens (stored in an httpOnly cookie) carry the account id.
export async function signSession(
  accountId: number,
  ttlSeconds = THIRTY_DAYS,
): Promise<string> {
  return sign(
    {
      purpose: "session",
      sub: String(accountId),
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    },
    config.tokenSecret,
    "HS256",
  );
}

export async function verifySession(token: string): Promise<number | null> {
  try {
    const p = (await verify(token, config.tokenSecret, "HS256")) as any;
    if (p.purpose !== "session") return null;
    return Number(p.sub);
  } catch {
    return null;
  }
}

// Unsubscribe tokens are long-lived (links live in old emails forever).
export async function signUnsub(
  subscriberId: number,
  ttlSeconds = TEN_YEARS,
): Promise<string> {
  return signToken(subscriberId, "unsubscribe", ttlSeconds);
}

export async function verifyUnsub(token: string): Promise<number | null> {
  const p = await verifyToken(token, "unsubscribe");
  return p ? Number(p.sub) : null;
}
