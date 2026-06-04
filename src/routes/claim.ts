// Claim-by-email: take ownership of an unclaimed list and get a dashboard, with
// no prior signup. An unclaimed list is owned by whoever first claims it
// (first-come); once owned it cannot be re-claimed by anyone else.

import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { queryOne } from "../db";
import { signClaim, verifyClaim, signSession } from "../tokens";
import { sendEmail } from "../email/transport";
import { claimEmail } from "../email/templates";
import { config } from "../config";
import { claimSentPage, confirmErrorPage } from "../pages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// POST /claim — request a claim link for { group, email }.
export async function requestClaim(c: Context) {
  const ctype = c.req.header("content-type") ?? "";
  const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
  const body: Record<string, any> = ctype.includes("application/json")
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody();

  const slug = String(body.group ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!slug || !EMAIL_RE.test(email)) {
    return c.json({ ok: false, error: "group and valid email required" }, 400);
  }

  const group = await queryOne<{ id: number; owner_account_id: number | null }>(
    `SELECT id, owner_account_id FROM groups WHERE slug = $1`,
    [slug],
  );
  if (!group) return c.notFound();
  if (group.owner_account_id) {
    return wantsJson
      ? c.json({ ok: false, error: "already claimed" }, 409)
      : c.html("This list has already been claimed.", 409);
  }

  const token = await signClaim(group.id, email);
  const url = `${config.baseUrl}/claim/${token}`;
  await sendEmail(claimEmail(email, slug, url));

  return wantsJson ? c.json({ ok: true }) : c.html(claimSentPage(email));
}

// GET /claim/:token — complete the claim: create/find the account, bind the
// list, set a session cookie, land on the dashboard.
export async function completeClaim(c: Context) {
  const token = c.req.param("token");
  if (!token) return c.html(confirmErrorPage(), 400);
  const claim = await verifyClaim(token);
  if (!claim) return c.html(confirmErrorPage(), 400);

  const account = await queryOne<{ id: number }>(
    `INSERT INTO accounts (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [claim.email],
  );
  if (!account) return c.html(confirmErrorPage(), 500);

  // Bind only if still unclaimed (guards against a race / double claim).
  const bound = await queryOne<{ id: number }>(
    `UPDATE groups SET owner_account_id = $1, pending_owner_email = NULL
      WHERE id = $2 AND owner_account_id IS NULL
      RETURNING id`,
    [account.id, claim.gid],
  );
  if (!bound) {
    const g = await queryOne<{ owner_account_id: number | null }>(
      `SELECT owner_account_id FROM groups WHERE id = $1`,
      [claim.gid],
    );
    if (!g || g.owner_account_id !== account.id) {
      return c.html("This list has already been claimed by someone else.", 409);
    }
  }

  const session = await signSession(account.id);
  setCookie(c, "co_session", session, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return c.redirect("/dashboard", 303);
}
