// API-triggered emails: per-account templates keyed by an event name. The
// customer's app POSTs { event, email, data } and we render + send the mapped
// letter ({{var}} interpolated from data).

import { query, queryOne } from "./db";
import { sendRendered, interpolate } from "./automations";

export interface Trigger {
  event: string;
  subject: string;
  body: string;
}

export async function setTrigger(
  accountId: number,
  event: string,
  subject: string,
  body: string,
): Promise<void> {
  await query(
    `INSERT INTO triggers (account_id, event, subject, body) VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id, event)
       DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body`,
    [accountId, event, subject, body],
  );
}

export async function getTrigger(
  accountId: number,
  event: string,
): Promise<Trigger | null> {
  return queryOne<Trigger>(
    `SELECT event, subject, body FROM triggers WHERE account_id = $1 AND event = $2`,
    [accountId, event],
  );
}

export async function listTriggers(accountId: number): Promise<Trigger[]> {
  return query<Trigger>(
    `SELECT event, subject, body FROM triggers WHERE account_id = $1 ORDER BY event`,
    [accountId],
  );
}

export async function removeTrigger(
  accountId: number,
  event: string,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `DELETE FROM triggers WHERE account_id = $1 AND event = $2 RETURNING id`,
    [accountId, event],
  );
  return !!row;
}

// Fire an event: render the trigger with `data` and send to `email`. If the
// address is a known confirmed subscriber, attach its id for one-click unsub + VERP.
export async function fireTrigger(
  accountId: number,
  event: string,
  email: string,
  data: Record<string, unknown>,
): Promise<{ sent: boolean; error?: string }> {
  const t = await getTrigger(accountId, event);
  if (!t) return { sent: false, error: `no trigger configured for event "${event}"` };

  const sub = await queryOne<{ id: number }>(
    `SELECT s.id FROM subscribers s JOIN groups g ON g.id = s.group_id
      WHERE g.owner_account_id = $1 AND lower(s.email) = lower($2)
        AND s.status = 'confirmed' LIMIT 1`,
    [accountId, email],
  );

  await sendRendered({
    ownerAccountId: accountId,
    to: email,
    subject: interpolate(t.subject, data),
    body: interpolate(t.body, data),
    subscriberId: sub?.id,
  });
  return { sent: true };
}
