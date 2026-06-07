// Stripe billing. Checkout to upgrade, Customer Portal to manage/cancel, and a
// webhook that maps subscription state → accounts.plan (which plan enforcement
// already reads). Unconfigured (no STRIPE_SECRET_KEY) ⇒ endpoints say so; the rest
// of the app runs fine without billing.

import Stripe from "stripe";
import { config } from "./config";
import { query, queryOne } from "./db";

let client: Stripe | null = null;

export function billingConfigured(): boolean {
  return !!config.billing.stripeSecretKey;
}

export function stripeClient(): Stripe {
  if (!config.billing.stripeSecretKey) {
    throw new Error("billing not configured (STRIPE_SECRET_KEY unset)");
  }
  if (!client) client = new Stripe(config.billing.stripeSecretKey);
  return client;
}

// Reverse map a Stripe price → our plan name.
export function planForPrice(priceId: string): string | null {
  for (const [plan, id] of Object.entries(config.billing.prices)) {
    if (id && id === priceId) return plan;
  }
  return null;
}

async function getOrCreateCustomer(accountId: number): Promise<string> {
  const acct = await queryOne<{ email: string; stripe_customer_id: string | null }>(
    `SELECT email, stripe_customer_id FROM accounts WHERE id = $1`,
    [accountId],
  );
  if (!acct) throw new Error("account not found");
  if (acct.stripe_customer_id) return acct.stripe_customer_id;

  const cust = await stripeClient().customers.create({
    email: acct.email,
    metadata: { accountId: String(accountId) },
  });
  await query(`UPDATE accounts SET stripe_customer_id = $1 WHERE id = $2`, [
    cust.id,
    accountId,
  ]);
  return cust.id;
}

export async function createCheckout(
  accountId: number,
  plan: string,
): Promise<string> {
  const price = config.billing.prices[plan];
  if (!price) throw new Error(`no Stripe price configured for plan "${plan}"`);
  const customer = await getOrCreateCustomer(accountId);
  const base = config.baseUrl;
  const session = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: String(accountId),
    metadata: { accountId: String(accountId), plan },
    success_url: `${base}/dashboard?upgraded=1`,
    cancel_url: `${base}/dashboard`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

export async function createPortal(accountId: number): Promise<string> {
  const customer = await getOrCreateCustomer(accountId);
  const session = await stripeClient().billingPortal.sessions.create({
    customer,
    return_url: `${config.baseUrl}/dashboard`,
  });
  return session.url;
}

// Apply a Stripe event to the account's plan. Idempotent — safe to receive twice.
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const accountId = Number(s.client_reference_id);
      if (!accountId) break;
      await query(
        `UPDATE accounts SET stripe_customer_id = $1, stripe_subscription_id = $2 WHERE id = $3`,
        [String(s.customer ?? ""), String(s.subscription ?? ""), accountId],
      );
      const plan = s.metadata?.plan;
      if (plan) {
        await query(`UPDATE accounts SET plan = $1 WHERE id = $2`, [
          plan,
          accountId,
        ]);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = planForPrice(priceId);
      const active = sub.status === "active" || sub.status === "trialing";
      await query(
        `UPDATE accounts SET plan = $1, stripe_subscription_id = $2 WHERE stripe_customer_id = $3`,
        [active && plan ? plan : "free", sub.id, String(sub.customer)],
      );
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await query(
        `UPDATE accounts SET plan = 'free', stripe_subscription_id = NULL WHERE stripe_customer_id = $1`,
        [String(sub.customer)],
      );
      break;
    }
  }
}
