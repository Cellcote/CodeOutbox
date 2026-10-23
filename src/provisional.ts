// Zero-signup lists. `npx codeoutbox` with no account creates a provisional list:
// the form works immediately, and the developer claims it (email → magic link)
// whenever they like — at the latest when the first subscriber confirms, which
// emails them a one-click claim link.
//
// Abuse rails while unclaimed: double opt-in forced, a small subscriber cap, no
// sending beyond the opt-in emails (broadcasts/automations require an owner), and
// the list is deleted when it expires.

import { randomBytes } from "node:crypto";
import { query, queryOne } from "./db";
import { config } from "./config";
import { signClaim } from "./tokens";
import { sendSystemEmail } from "./sender";
import { firstSubscriberEmail } from "./email/templates";
import { maskEmail } from "./mask";

export const PROVISIONAL_TTL_DAYS = 14;
export const PROVISIONAL_MAX_SUBSCRIBERS = 25;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ProvisionalList {
  slug: string;
  public_id: string;
  form_url: string;
  claim_url: string;
  page_url: string;
  expires_at: string;
}

export async function createProvisional(input: {
  slug?: string;
  name?: string;
  email?: string;
}): Promise<ProvisionalList> {
  const slug = String(input.slug ?? "newsletter").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error("slug must be lowercase letters, numbers, hyphens");
  }
  const email = input.email ? String(input.email).trim().toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) throw new Error("invalid email");

  await deleteExpired();

  const publicId = randomBytes(6).toString("base64url");
  const secret = randomBytes(18).toString("base64url");
  const row = await queryOne<{ expires_at: string }>(
    `INSERT INTO groups (slug, name, double_opt_in, public_id, pending_owner_email,
                         claim_secret, expires_at)
     VALUES ($1, $2, TRUE, $3, $4, $5, now() + make_interval(days => $6))
     RETURNING expires_at`,
    [slug, input.name ? String(input.name).slice(0, 80) : null, publicId, email, secret, PROVISIONAL_TTL_DAYS],
  );
  return {
    slug,
    public_id: publicId,
    form_url: `${config.baseUrl}/f/${publicId}`,
    claim_url: `${config.baseUrl}/c/${secret}`,
    page_url: `${config.baseUrl}/l/${publicId}`,
    expires_at: new Date(row!.expires_at).toISOString(),
  };
}

// Unclaimed + past expiry → gone (subscribers first; FKs). Legacy unclaimed lists
// (no expires_at) are left alone.
export async function deleteExpired(): Promise<void> {
  const where = `owner_account_id IS NULL AND expires_at IS NOT NULL AND expires_at < now()`;
  await query(
    `DELETE FROM subscribers WHERE group_id IN (SELECT id FROM groups WHERE ${where})`,
  );
  await query(`DELETE FROM groups WHERE ${where}`);
}

export interface UnclaimedGate {
  ok: boolean;
  status?: 410 | 402;
  error?: string;
}

// Called by form ingest for lists without an owner.
export async function gateUnclaimed(
  group: { id: number; expires_at: string | null },
  email: string,
): Promise<UnclaimedGate> {
  if (!group.expires_at) return { ok: true }; // legacy unclaimed list
  if (new Date(group.expires_at) < new Date()) {
    return { ok: false, status: 410, error: "this list expired before it was claimed" };
  }
  const existing = await queryOne<{ x: number }>(
    `SELECT 1 AS x FROM subscribers WHERE group_id = $1 AND email = $2`,
    [group.id, email],
  );
  if (existing) return { ok: true };
  const n = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM subscribers WHERE group_id = $1`,
    [group.id],
  );
  if (Number(n?.n ?? 0) >= PROVISIONAL_MAX_SUBSCRIBERS) {
    return { ok: false, status: 402, error: "this list is full until its owner claims it" };
  }
  return { ok: true };
}

// After a confirm: if this was the first confirmed subscriber of an unclaimed list
// whose creator left an email, send them a one-click claim link.
export async function maybeNudgeClaim(groupId: number, readerEmail: string): Promise<void> {
  const g = await queryOne<{
    slug: string;
    name: string | null;
    pending_owner_email: string | null;
    expires_at: string | null;
    confirmed: number;
  }>(
    `SELECT g.slug, g.name, g.pending_owner_email, g.expires_at,
            (SELECT COUNT(*)::int FROM subscribers s
              WHERE s.group_id = g.id AND s.status = 'confirmed') AS confirmed
       FROM groups g
      WHERE g.id = $1 AND g.owner_account_id IS NULL`,
    [groupId],
  );
  if (!g?.pending_owner_email || !g.expires_at || Number(g.confirmed) !== 1) return;
  const token = await signClaim(groupId, g.pending_owner_email);
  const expires = new Date(g.expires_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  await sendSystemEmail(
    firstSubscriberEmail(
      g.pending_owner_email,
      g.name || g.slug,
      `${config.baseUrl}/claim/${token}`,
      expires,
      maskEmail(readerEmail),
    ),
  );
}

export async function findByClaimSecret(secret: string) {
  return queryOne<{
    id: number;
    slug: string;
    name: string | null;
    owner_account_id: number | null;
    pending_owner_email: string | null;
    expires_at: string | null;
  }>(
    `SELECT id, slug, name, owner_account_id, pending_owner_email, expires_at
       FROM groups WHERE claim_secret = $1`,
    [secret],
  );
}
