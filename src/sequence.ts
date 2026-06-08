// Sequence (drip): timed follow-up letters after a subscriber confirms. Each step
// has a delay (from confirm) and is sent at most once per subscriber.

import { query, queryOne } from "./db";
import { enqueue } from "./queue";
import { sendRendered } from "./automations";

export interface SequenceStep {
  id: number;
  delay_minutes: number;
  subject: string;
  body: string;
}

export async function listSteps(
  accountId: number,
  slug: string,
): Promise<SequenceStep[]> {
  return query<SequenceStep>(
    `SELECT st.id, st.delay_minutes, st.subject, st.body
       FROM sequence_steps st JOIN groups g ON g.id = st.group_id
      WHERE g.slug = $1 AND g.owner_account_id = $2
      ORDER BY st.delay_minutes, st.id`,
    [slug, accountId],
  );
}

export async function addStep(
  accountId: number,
  slug: string,
  delayMinutes: number,
  subject: string,
  body: string,
): Promise<SequenceStep | null> {
  const g = await queryOne<{ id: number }>(
    `SELECT id FROM groups WHERE slug = $1 AND owner_account_id = $2`,
    [slug, accountId],
  );
  if (!g) return null;
  return queryOne<SequenceStep>(
    `INSERT INTO sequence_steps (account_id, group_id, delay_minutes, subject, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, delay_minutes, subject, body`,
    [accountId, g.id, Math.max(0, delayMinutes), subject, body],
  );
}

export async function removeStep(
  accountId: number,
  slug: string,
  stepId: number,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `DELETE FROM sequence_steps st USING groups g
      WHERE st.group_id = g.id AND st.id = $3
        AND g.slug = $1 AND g.owner_account_id = $2
      RETURNING st.id`,
    [slug, accountId, stepId],
  );
  return !!row;
}

// On confirm: schedule every step for this subscriber at its delay.
export async function triggerSequence(
  subscriberId: number,
  groupId: number,
): Promise<void> {
  const steps = await query<{ id: number; delay_minutes: number }>(
    `SELECT id, delay_minutes FROM sequence_steps WHERE group_id = $1`,
    [groupId],
  );
  for (const s of steps) {
    const runAt = new Date(Date.now() + s.delay_minutes * 60_000);
    await enqueue("sequence.send", { stepId: s.id, subscriberId }, runAt);
  }
}

export async function runSequenceJob(payload: {
  stepId: number;
  subscriberId: number;
}): Promise<void> {
  const { stepId, subscriberId } = payload;

  // Claim exactly-once for this (step, subscriber).
  const claim = await queryOne<{ subscriber_id: number }>(
    `INSERT INTO sequence_sends (step_id, subscriber_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING subscriber_id`,
    [stepId, subscriberId],
  );
  if (!claim) return; // already sent

  const row = await queryOne<{
    subject: string;
    body: string;
    account_id: number;
    email: string;
    status: string;
  }>(
    `SELECT st.subject, st.body, st.account_id, s.email, s.status
       FROM sequence_steps st, subscribers s
      WHERE st.id = $1 AND s.id = $2`,
    [stepId, subscriberId],
  );
  // Only deliver to a still-confirmed recipient (skip unsubscribed/bounced).
  if (!row) {
    await query(
      `DELETE FROM sequence_sends WHERE step_id = $1 AND subscriber_id = $2`,
      [stepId, subscriberId],
    );
    return;
  }
  if (row.status !== "confirmed") return; // claimed but intentionally not sent

  try {
    await sendRendered({
      ownerAccountId: row.account_id,
      to: row.email,
      subject: row.subject,
      body: row.body,
      subscriberId,
    });
  } catch (err) {
    await query(
      `DELETE FROM sequence_sends WHERE step_id = $1 AND subscriber_id = $2`,
      [stepId, subscriberId],
    );
    throw err;
  }
}
