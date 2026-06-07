// Authd billing endpoints (wrapped by `co upgrade` / `co billing`).
//   POST /v1/billing/checkout { plan } → Stripe Checkout URL (upgrade)
//   POST /v1/billing/portal           → Stripe Customer Portal URL (manage/cancel)

import type { Context } from "hono";
import { getAccountId } from "../auth";
import { billingConfigured, createCheckout, createPortal } from "../billing";
import { PLANS } from "../plans";

export async function checkoutEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  if (!billingConfigured())
    return c.json({ ok: false, error: "billing not configured" }, 503);

  const body = await c.req.json().catch(() => ({}));
  const plan = String(body.plan ?? "").trim().toLowerCase();
  const interval = body.interval === "year" ? "year" : "month";
  if (plan === "free" || !PLANS[plan]) {
    return c.json(
      { ok: false, error: `unknown paid plan "${plan}"` },
      400,
    );
  }
  try {
    return c.json({ ok: true, url: await createCheckout(accountId, plan, interval) });
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 400);
  }
}

export async function portalEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  if (!billingConfigured())
    return c.json({ ok: false, error: "billing not configured" }, 503);
  try {
    return c.json({ ok: true, url: await createPortal(accountId) });
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 400);
  }
}
