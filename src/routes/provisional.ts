// Zero-signup endpoints (public, rate-limited in index.ts).
//   POST /v1/provisional   { slug?, name?, email? } → a working form id + claim link
//   GET  /c/:secret        claim page (enter email)
//   POST /c/:secret        email a claim magic link → /claim/:token binds the list

import type { Context } from "hono";
import { queryOne } from "../db";
import { config } from "../config";
import { signClaim } from "../tokens";
import { sendSystemEmail } from "../sender";
import { claimEmail } from "../email/templates";
import { claimSentPage, claimStartPage, messagePage } from "../pages";
import { createProvisional, findByClaimSecret } from "../provisional";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createProvisionalEndpoint(c: Context) {
  const body = await c.req.json().catch(() => ({}));
  try {
    return c.json({ ok: true, ...(await createProvisional(body)) });
  } catch (err) {
    return c.json({ ok: false, error: String((err as Error).message) }, 400);
  }
}

async function liveGroup(c: Context) {
  const g = await findByClaimSecret(c.req.param("secret") ?? "");
  if (!g || (g.expires_at && new Date(g.expires_at) < new Date() && !g.owner_account_id)) {
    return { g: null, res: c.html(messagePage("Link expired", "<h1>This claim link has expired</h1><p>Unclaimed lists are deleted after 14 days. Run <code>npx codeoutbox</code> again to start a new one.</p>"), 404) };
  }
  if (g.owner_account_id) {
    return { g: null, res: c.html(messagePage("Already claimed", `<h1>Already claimed</h1><p>This list has an owner. <a href="/dashboard">Open your dashboard</a>.</p>`), 409) };
  }
  return { g, res: null };
}

export async function claimStart(c: Context) {
  const { g, res } = await liveGroup(c);
  if (!g) return res!;
  const n = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM subscribers WHERE group_id = $1 AND status = 'confirmed'`,
    [g.id],
  );
  return c.html(
    claimStartPage({
      secret: c.req.param("secret") ?? "",
      list: g.name || g.slug,
      email: g.pending_owner_email,
      subscribers: Number(n?.n ?? 0),
      expiresOn: g.expires_at ? new Date(g.expires_at).toISOString().slice(0, 10) : null,
    }),
  );
}

export async function claimStartPost(c: Context) {
  const { g, res } = await liveGroup(c);
  if (!g) return res!;
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return c.html("Invalid email address", 400);
  const token = await signClaim(g.id, email);
  await sendSystemEmail(claimEmail(email, g.slug, `${config.baseUrl}/claim/${token}`));
  return c.html(claimSentPage(email));
}
