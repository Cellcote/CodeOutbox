// Instant onboarding: email → magic link → account + API key. No group, no
// password, no claim/cookie dance. This is the front door for a SaaS.

import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { queryOne } from "../db";
import { signLogin, verifyLogin, signSession } from "../tokens";
import { sendEmail } from "../email/transport";
import { loginEmail } from "../email/templates";
import { createApiToken } from "../apitokens";
import { config } from "../config";
import {
  signupFormPage,
  signupSentPage,
  signupKeyPage,
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
  await sendEmail(loginEmail(email, `${config.baseUrl}/signup/${token}`));
  return wantsJson ? c.json({ ok: true }) : c.html(signupSentPage(email));
}

// GET /signup/:token — create/find the account, mint an API key, sign in.
export async function completeSignup(c: Context) {
  const token = c.req.param("token");
  const email = token ? await verifyLogin(token) : null;
  if (!email) return c.html(confirmErrorPage(), 400);

  const account = await queryOne<{ id: number }>(
    `INSERT INTO accounts (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email],
  );
  if (!account) return c.html(confirmErrorPage(), 500);

  const { token: apiKey } = await createApiToken(account.id, "signup");

  const session = await signSession(account.id);
  setCookie(c, "co_session", session, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return c.html(signupKeyPage(email, apiKey));
}
