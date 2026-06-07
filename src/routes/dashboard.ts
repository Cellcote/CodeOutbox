// Account dashboard: plan + usage, lists, sending domains, brand, recent
// subscribers — plus session-based billing redirects (browser → Stripe). Session
// comes from the httpOnly cookie (getAccountId also accepts it).

import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { query, queryOne } from "../db";
import { getAccountId } from "../auth";
import { getUsage } from "../usage";
import { listDomains } from "../domains";
import { resolveBrand } from "../brand";
import { listWebhooks } from "../webhooks";
import { billingConfigured, createCheckout, createPortal } from "../billing";
import { PLANS } from "../plans";
import { dashboardPage, notLoggedInPage, messagePage } from "../pages";
import { escapeHtml } from "../email/shell";

export async function dashboard(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.html(notLoggedInPage(), 401);

  const account = await queryOne<{ email: string }>(
    `SELECT email FROM accounts WHERE id = $1`,
    [accountId],
  );
  if (!account) return c.html(notLoggedInPage(), 401);

  const groups = await query<{
    slug: string;
    public_id: string;
    name: string | null;
    total: number;
    confirmed: number;
  }>(
    `SELECT g.slug, g.public_id, g.name,
            COUNT(s.id)::int AS total,
            COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::int AS confirmed
       FROM groups g
       LEFT JOIN subscribers s ON s.group_id = g.id
      WHERE g.owner_account_id = $1
      GROUP BY g.id, g.slug, g.public_id, g.name
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

  const usage = await getUsage(accountId);
  const domains = (await listDomains(accountId)).map((x) => ({
    subdomain: x.subdomain,
    status: x.status,
  }));
  const brand = await resolveBrand(accountId);
  const webhooks = (await listWebhooks(accountId)).map((w) => ({
    id: w.id,
    url: w.url,
    events: w.events,
  }));

  return c.html(
    dashboardPage({
      email: account.email,
      usage,
      groups,
      domains,
      brand,
      recent,
      webhooks,
      billingEnabled: billingConfigured(),
    }),
  );
}

export async function logout(c: Context) {
  setCookie(c, "co_session", "", { path: "/", maxAge: 0 });
  return c.redirect("/signup", 303); // land on the sign-in page, not a dead end
}

const billingError = (c: Context, title: string, msg: string, code: 400 | 503) =>
  c.html(
    messagePage(
      title,
      `<h1 class="err">${escapeHtml(title)}</h1>` +
        `<p class="muted">${escapeHtml(msg)}</p>` +
        `<p><a href="/dashboard">← Back to dashboard</a></p>`,
    ),
    code,
  );

export async function upgradeRedirect(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.redirect("/signup", 303);
  if (!billingConfigured())
    return billingError(c, "Billing not enabled", "Stripe isn't configured on this instance.", 503);
  const plan = (c.req.query("plan") ?? "").toLowerCase();
  const interval = c.req.query("interval") === "year" ? "year" : "month";
  if (plan === "free" || !PLANS[plan]) return c.redirect("/dashboard", 303);
  try {
    return c.redirect(await createCheckout(accountId, plan, interval), 303);
  } catch (e) {
    return billingError(c, "Couldn't start checkout", (e as Error).message, 400);
  }
}

export async function portalRedirect(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.redirect("/signup", 303);
  if (!billingConfigured()) return c.redirect("/dashboard", 303);
  try {
    return c.redirect(await createPortal(accountId), 303);
  } catch (e) {
    return billingError(c, "Couldn't open billing", (e as Error).message, 400);
  }
}
