// Instant onboarding: email → magic link → account (+ a welcome page on first sign-in). No group, no
// password, no claim/cookie dance. This is the front door for a SaaS.

import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { queryOne } from "../db";
import { signLogin, verifyLogin, signSession } from "../tokens";
import { sendSystemEmail } from "../sender";
import { loginEmail } from "../email/templates";
import { config } from "../config";
import {
  signupFormPage,
  signupSentPage,
  welcomePage,
  confirmErrorPage,
} from "../pages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function signupForm(c: Context) {
  return c.html(signupFormPage());
}

// POST /signup — email a sign-in link.
export async function requestSignup(c: Context) {
  const ctype = c.req.header("content-type") ?? "";
  const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
  const body: Record<string, any> = ctype.includes("application/json")
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody();

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return c.json({ ok: false, error: "valid email required" }, 400);
  }

  const token = await signLogin(email);
  await sendSystemEmail(loginEmail(email, `${config.baseUrl}/signup/${token}`));
  return wantsJson ? c.json({ ok: true }) : c.html(signupSentPage(email));
}

// GET /signup/:token — create/find the account and sign in.
export async function completeSignup(c: Context) {
  const token = c.req.param("token");
  const email = token ? await verifyLogin(token) : null;
  if (!email) return c.html(confirmErrorPage(), 400);

  const existing = await queryOne<{ id: number }>(`SELECT id FROM accounts WHERE email = $1`, [email]);
  const account =
    existing ??
    (await queryOne<{ id: number }>(
      `INSERT INTO accounts (email) VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [email],
    ));
  if (!account) return c.html(confirmErrorPage(), 500);

  const session = await signSession(account.id);
  setCookie(c, "co_session", session, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // New account → welcome + first step; returning → straight to the dashboard.
  // (No API key minted per sign-in anymore; keys are created in Settings.)
  return existing ? c.redirect("/dashboard", 303) : c.html(welcomePage(email));
}
