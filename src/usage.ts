// Usage metering per account: active subscribers + rolling-30-day broadcast sends,
// against the account's plan. Used to enforce caps and surface usage.

import { queryOne } from "./db";
import { getPlan } from "./plans";

export interface Meter {
  used: number;
  limit: number;
  plan: string;
}

async function planFor(accountId: number): Promise<ReturnType<typeof getPlan>> {
  const a = await queryOne<{ plan: string }>(
    `SELECT plan FROM accounts WHERE id = $1`,
    [accountId],
  );
  return getPlan(a?.plan);
}

export async function subscriberUsage(accountId: number): Promise<Meter> {
  const plan = await planFor(accountId);
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM subscribers s JOIN groups g ON g.id = s.group_id
      WHERE g.owner_account_id = $1 AND s.status <> 'unsubscribed'`,
    [accountId],
  );
  return { used: r?.n ?? 0, limit: plan.subscribers, plan: plan.name };
}

export async function sendUsage(accountId: number): Promise<Meter> {
  const plan = await planFor(accountId);
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM broadcast_recipients br JOIN broadcasts b ON b.id = br.broadcast_id
      WHERE b.account_id = $1 AND br.status = 'sent'
        AND b.created_at > now() - interval '30 days'`,
    [accountId],
  );
  return { used: r?.n ?? 0, limit: plan.sends, plan: plan.name };
}

// Infinity (business) → null so it serializes as "unlimited".
const fin = (x: number) => (Number.isFinite(x) ? x : null);

export async function getUsage(accountId: number) {
  const subs = await subscriberUsage(accountId);
  const sends = await sendUsage(accountId);
  return {
    plan: subs.plan,
    subscribers: subs.used,
    subscriberLimit: fin(subs.limit),
    sends30d: sends.used,
    sendLimit: fin(sends.limit),
  };
}
