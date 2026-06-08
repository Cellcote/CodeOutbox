// Win-back: re-engage subscribers who received broadcasts but haven't opened or
// clicked in N days. A periodic scan sends each eligible subscriber one re-engagement
// letter (once), protecting sender reputation by surfacing dead weight.

import { query, queryOne } from "./db";
import { enqueue } from "./queue";
import { reportError } from "./errors";
import { sendRendered } from "./automations";

const SCAN_INTERVAL_MIN = 360; // every 6h

export interface Winback {
  subject: string;
  body: string;
  days: number;
}

export async function getWinback(
  accountId: number,
  slug: string,
): Promise<Winback | null> {
  const row = await queryOne<{
    winback_subject: string | null;
    winback_body: string | null;
    winback_days: number;
  }>(
    `SELECT winback_subject, winback_body, winback_days FROM groups
      WHERE slug = $1 AND owner_account_id = $2`,
    [slug, accountId],
  );
  if (!row || !row.winback_body) return null;
  return {
    subject: row.winback_subject ?? "We miss you",
    body: row.winback_body,
    days: Number(row.winback_days),
  };
}

export async function setWinback(
  accountId: number,
  slug: string,
  subject: string,
  body: string,
  days: number,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `UPDATE groups SET winback_subject = $3, winback_body = $4, winback_days = $5
      WHERE slug = $1 AND owner_account_id = $2 RETURNING id`,
    [slug, accountId, subject || "We miss you", body, Math.max(1, days || 60)],
  );
  return !!row;
}

export async function clearWinback(
  accountId: number,
  slug: string,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `UPDATE groups SET winback_subject = NULL, winback_body = NULL
      WHERE slug = $1 AND owner_account_id = $2 RETURNING id`,
    [slug, accountId],
  );
  return !!row;
}

export async function runWinbackScan(): Promise<void> {
  try {
    const groups = await query<{
      id: number;
      owner_account_id: number;
      winback_subject: string | null;
      winback_body: string;
      winback_days: number;
    }>(
      `SELECT id, owner_account_id, winback_subject, winback_body, winback_days
         FROM groups
        WHERE winback_body IS NOT NULL AND winback_body <> '' AND owner_account_id IS NOT NULL`,
    );
    for (const g of groups) {
      // Eligible: confirmed, never won back, joined > N days ago, *did* receive a
      // broadcast, but no open/click in the last N days.
      const eligible = await query<{ id: number; email: string }>(
        `SELECT s.id, s.email
           FROM subscribers s
          WHERE s.group_id = $1 AND s.status = 'confirmed' AND s.winbacked_at IS NULL
            AND s.created_at < now() - make_interval(days => $2)
            AND EXISTS (SELECT 1 FROM broadcast_recipients br
                         WHERE br.subscriber_id = s.id AND br.status = 'sent')
            AND NOT EXISTS (SELECT 1 FROM tracking_events te
                             WHERE te.subscriber_id = s.id
                               AND te.created_at > now() - make_interval(days => $2))
          LIMIT 200`,
        [g.id, g.winback_days],
      );
      for (const sub of eligible) {
        try {
          await sendRendered({
            ownerAccountId: g.owner_account_id,
            to: sub.email,
            subject: g.winback_subject ?? "We miss you",
            body: g.winback_body,
            subscriberId: sub.id,
          });
          await query(`UPDATE subscribers SET winbacked_at = now() WHERE id = $1`, [
            sub.id,
          ]);
        } catch (err) {
          reportError("winback send", err); // leave winbacked_at null → retried next scan
        }
      }
    }
  } catch (err) {
    reportError("winback scan", err);
  } finally {
    await enqueue("winback.scan", {}, new Date(Date.now() + SCAN_INTERVAL_MIN * 60_000));
  }
}
