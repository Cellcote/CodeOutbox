// Welcome email (autoresponder): a per-list letter sent once to each subscriber
// the moment they become confirmed — "thanks for signing up, here's a code".
// The first automation, and the seed of the "sequences" roadmap item.

import { query, queryOne } from "./db";
import { enqueue } from "./queue";
import { sendRendered } from "./automations";

export interface Welcome {
  subject: string;
  body: string;
}

export async function getWelcome(
  accountId: number,
  slug: string,
): Promise<Welcome | null> {
  const row = await queryOne<{
    welcome_subject: string | null;
    welcome_body: string | null;
  }>(
    `SELECT welcome_subject, welcome_body FROM groups
      WHERE slug = $1 AND owner_account_id = $2`,
    [slug, accountId],
  );
  if (!row || !row.welcome_body) return null;
  return { subject: row.welcome_subject ?? "Welcome", body: row.welcome_body };
}

export async function setWelcome(
  accountId: number,
  slug: string,
  subject: string,
  body: string,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `UPDATE groups SET welcome_subject = $3, welcome_body = $4
      WHERE slug = $1 AND owner_account_id = $2 RETURNING id`,
    [slug, accountId, subject || "Welcome", body],
  );
  return !!row;
}

export async function clearWelcome(
  accountId: number,
  slug: string,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `UPDATE groups SET welcome_subject = NULL, welcome_body = NULL
      WHERE slug = $1 AND owner_account_id = $2 RETURNING id`,
    [slug, accountId],
  );
  return !!row;
}

// Called when a subscriber becomes confirmed. Cheap pre-check, then enqueue the
// actual send — the job claims it exactly-once via welcomed_at.
export async function triggerWelcome(
  subscriberId: number,
  groupId: number,
): Promise<void> {
  const has = await queryOne<{ id: number }>(
    `SELECT id FROM groups WHERE id = $1 AND welcome_body IS NOT NULL AND welcome_body <> ''`,
    [groupId],
  );
  if (has) await enqueue("welcome.send", { subscriberId, groupId });
}

// Queue handler (registered in index.ts). Atomically claims the welcome so it's
// sent at most once per subscriber, regardless of duplicate confirms/jobs.
export async function runWelcomeJob(payload: {
  subscriberId: number;
  groupId: number;
}): Promise<void> {
  const { subscriberId, groupId } = payload;
  const g = await queryOne<{
    welcome_subject: string | null;
    welcome_body: string | null;
    owner_account_id: number | null;
  }>(
    `SELECT welcome_subject, welcome_body, owner_account_id FROM groups WHERE id = $1`,
    [groupId],
  );
  if (!g || !g.welcome_body || !g.owner_account_id) return;

  // Only the first job to flip welcomed_at (for a still-confirmed sub) sends.
  const sub = await queryOne<{ email: string }>(
    `UPDATE subscribers SET welcomed_at = now()
      WHERE id = $1 AND group_id = $2 AND status = 'confirmed' AND welcomed_at IS NULL
      RETURNING email`,
    [subscriberId, groupId],
  );
  if (!sub) return;

  try {
    await sendRendered({
      ownerAccountId: g.owner_account_id,
      to: sub.email,
      subject: g.welcome_subject ?? "Welcome",
      body: g.welcome_body,
      subscriberId,
    });
  } catch (err) {
    // Roll back the claim so a retry can try again.
    await query(`UPDATE subscribers SET welcomed_at = NULL WHERE id = $1`, [
      subscriberId,
    ]);
    throw err;
  }
}
