// First-run checklist state ("Get your first subscriber"), derived from data the
// account already has — nothing to store. Rendered into the dashboard and polled
// via GET /v1/onboarding so the page reacts when the first subscriber arrives.
//   1 create a list · 2 form on your site (any subscriber) · 3 subscribe yourself ·
//   4 send your first email

import type { Context } from "hono";
import { queryOne } from "./db";
import { getAccountId } from "./auth";
import { maskEmail } from "./mask";

export interface Onboarding {
  list: { slug: string; name: string | null; public_id: string } | null;
  subscribers: number; // any status, all lists
  confirmed: number;
  formWorks: boolean;
  selfConfirmed: boolean;
  sent: boolean;
  firstReader: string | null; // masked
  done: number; // 0..4
}

export async function onboardingState(accountId: number): Promise<Onboarding> {
  const acct = await queryOne<{ email: string }>(`SELECT email FROM accounts WHERE id = $1`, [accountId]);
  const list = await queryOne<{ slug: string; name: string | null; public_id: string }>(
    `SELECT slug, name, public_id FROM groups WHERE owner_account_id = $1 ORDER BY id LIMIT 1`,
    [accountId],
  );
  const counts = await queryOne<{ total: number; confirmed: number; self: number; first: string | null }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE s.status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE s.status = 'confirmed' AND s.email = $2)::int AS self,
            (SELECT s2.email FROM subscribers s2 JOIN groups g2 ON g2.id = s2.group_id
              WHERE g2.owner_account_id = $1 AND s2.email <> $2
              ORDER BY s2.id LIMIT 1) AS first
       FROM subscribers s JOIN groups g ON g.id = s.group_id
      WHERE g.owner_account_id = $1`,
    [accountId, acct?.email ?? ""],
  );
  const sent = await queryOne<{ x: number }>(
    `SELECT 1 AS x FROM broadcasts WHERE account_id = $1 LIMIT 1`,
    [accountId],
  );
  const subscribers = Number(counts?.total ?? 0);
  const state = {
    list: list ?? null,
    subscribers,
    confirmed: Number(counts?.confirmed ?? 0),
    formWorks: subscribers > 0,
    selfConfirmed: Number(counts?.self ?? 0) > 0,
    sent: !!sent,
    firstReader: counts?.first ? maskEmail(counts.first) : null,
  };
  const done = [!!state.list, state.formWorks, state.selfConfirmed, state.sent].filter(Boolean).length;
  return { ...state, done };
}

export async function onboardingEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  return c.json({ ok: true, ...(await onboardingState(accountId)) });
}
