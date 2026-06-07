// POST /webhooks/stripe — Stripe events → accounts.plan. Verifies the signature
// against the RAW body (Hono's c.req.text()), so no body parser may run first.

import type { Context } from "hono";
import { config } from "../config";
import {
  stripeClient,
  billingConfigured,
  handleStripeEvent,
} from "../billing";

export async function stripeWebhook(c: Context) {
  if (!billingConfigured() || !config.billing.webhookSecret) {
    return c.json({ ok: false, error: "billing not configured" }, 503);
  }
  const sig = c.req.header("stripe-signature") ?? "";
  const raw = await c.req.text();

  let event;
  try {
    event = stripeClient().webhooks.constructEvent(
      raw,
      sig,
      config.billing.webhookSecret,
    );
  } catch (e) {
    return c.json({ ok: false, error: `signature: ${(e as Error).message}` }, 400);
  }

  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error("stripe webhook handler error:", e);
    return c.json({ ok: false }, 500);
  }
  return c.json({ received: true });
}
