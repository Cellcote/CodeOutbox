// Read-only dashboard for the signed-in account: owned lists with counts and a
// recent-subscribers feed. Session comes from the httpOnly cookie set at claim.

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { query, queryOne } from "../db";
import { verifySession } from "../tokens";
import { dashboardPage, notLoggedInPage } from "../pages";

export async function dashboard(c: Context) {
  const token = getCookie(c, "co_session");
  const accountId = token ? await verifySession(token) : null;
  if (!accountId) return c.html(notLoggedInPage(), 401);

  const account = await queryOne<{ email: string }>(
    `SELECT email FROM accounts WHERE id = $1`,
    [accountId],
  );
  if (!account) return c.html(notLoggedInPage(), 401);

  const groups = await query<{
    slug: string;
    name: string | null;
    total: number;
    confirmed: number;
  }>(
    `SELECT g.slug, g.name,
            COUNT(s.id)::int AS total,
            COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::int AS confirmed
       FROM groups g
       LEFT JOIN subscribers s ON s.group_id = g.id
      WHERE g.owner_account_id = $1
      GROUP BY g.id, g.slug, g.name
      ORDER BY g.slug`,
    [accountId],
  );

  const recent = await query<{ email: string; status: string; slug: string }>(
    `SELECT s.email, s.status, g.slug
       FROM subscribers s
       JOIN groups g ON g.id = s.group_id
      WHERE g.owner_account_id = $1
      ORDER BY s.created_at DESC
      LIMIT 10`,
    [accountId],
  );

  return c.html(dashboardPage(account.email, groups, recent));
}

export async function logout(c: Context) {
  setCookie(c, "co_session", "", { path: "/", maxAge: 0 });
  return c.redirect("/", 303);
}
