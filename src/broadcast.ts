// Broadcast service: preview (recipient count + spam-lint) and send (fan-out to
// confirmed, non-suppressed subscribers with per-recipient unsubscribe + status).
//
// NOTE: sending here is an in-process throttled loop. That keeps the skeleton
// portable across the pg/pglite drivers. A durable queue (pg-boss on Postgres) is
// the production path — see PRD §8 / M3 follow-up — and slots in behind this API.

import { createHash } from "node:crypto";
import { query, queryOne } from "./db";
import {
  parseCampaign,
  composeMessage,
  lintCampaign,
  type RenderedCampaign,
} from "./campaign";
import { signUnsub } from "./tokens";
import { sendEmail } from "./email/transport";
import { accountHasVerifiedDomain } from "./domains";
import { config } from "./config";

export interface PreviewResult {
  subject: string;
  group: string;
  recipientCount: number;
  warnings: string[];
  html: string;
  text: string;
}

export interface SendResult {
  broadcastId: number;
  alreadySent: boolean;
  sent: number;
  failed: number;
  recipientCount: number;
}

interface OwnedGroup {
  id: number;
  slug: string;
}

async function resolveOwnedGroup(
  slug: string,
  accountId: number,
): Promise<OwnedGroup> {
  const group = await queryOne<OwnedGroup>(
    `SELECT id, slug FROM groups WHERE slug = $1 AND owner_account_id = $2`,
    [slug, accountId],
  );
  if (!group) {
    throw new Error(
      `group "${slug}" not found or not owned by you (claim it first)`,
    );
  }
  return group;
}

interface Recipient {
  id: number;
  email: string;
}

async function loadRecipients(
  groupId: number,
  accountId: number,
): Promise<Recipient[]> {
  return query<Recipient>(
    `SELECT s.id, s.email
       FROM subscribers s
      WHERE s.group_id = $1
        AND s.status = 'confirmed'
        AND NOT EXISTS (
          SELECT 1 FROM suppressions sup
           WHERE sup.account_id = $2 AND sup.email = s.email
        )
      ORDER BY s.id`,
    [groupId, accountId],
  );
}

function contentHash(r: RenderedCampaign): string {
  return createHash("sha256")
    .update(`${r.meta.subject}\n${r.meta.group}\n${r.bodyText}`)
    .digest("hex");
}

export async function previewBroadcast(
  source: string,
  accountId: number,
): Promise<PreviewResult> {
  const r = parseCampaign(source);
  const group = await resolveOwnedGroup(r.meta.group, accountId);
  const recipients = await loadRecipients(group.id, accountId);
  const sample = composeMessage(r, `${config.baseUrl}/unsubscribe/SAMPLE`);

  const warnings = lintCampaign(r);
  if (
    recipients.length > config.send.freeTierLimit &&
    !(await accountHasVerifiedDomain(accountId))
  ) {
    warnings.push(
      `Sending to ${recipients.length} exceeds the free-tier limit (${config.send.freeTierLimit}). ` +
        `Authenticate a domain first: co domains add <subdomain>.`,
    );
  }

  return {
    subject: r.meta.subject,
    group: r.meta.group,
    recipientCount: recipients.length,
    warnings,
    html: sample.html,
    text: sample.text,
  };
}

export async function sendBroadcast(
  source: string,
  accountId: number,
): Promise<SendResult> {
  const r = parseCampaign(source);
  const group = await resolveOwnedGroup(r.meta.group, accountId);
  const hash = contentHash(r);

  // Idempotency: same content already sent/sending for this group → no double-send.
  const existing = await queryOne<{ id: number; sent_count: number }>(
    `SELECT id, sent_count FROM broadcasts
      WHERE group_id = $1 AND content_hash = $2 AND status IN ('sending','sent')
      ORDER BY id DESC LIMIT 1`,
    [group.id, hash],
  );
  if (existing) {
    return {
      broadcastId: existing.id,
      alreadySent: true,
      sent: existing.sent_count,
      failed: 0,
      recipientCount: existing.sent_count,
    };
  }

  const recipients = await loadRecipients(group.id, accountId);

  // Hybrid sending identity: above the free-tier limit, require a verified domain.
  if (
    recipients.length > config.send.freeTierLimit &&
    !(await accountHasVerifiedDomain(accountId))
  ) {
    throw new Error(
      `sending to ${recipients.length} recipients exceeds the free-tier limit ` +
        `(${config.send.freeTierLimit}). Authenticate a domain first: ` +
        `co domains add <subdomain>`,
    );
  }

  const bc = await queryOne<{ id: number }>(
    `INSERT INTO broadcasts (account_id, group_id, subject, content_hash, status)
     VALUES ($1, $2, $3, $4, 'sending') RETURNING id`,
    [accountId, group.id, r.meta.subject, hash],
  );
  if (!bc) throw new Error("failed to create broadcast");

  let sent = 0;
  let failed = 0;

  for (const rcpt of recipients) {
    const token = await signUnsub(rcpt.id);
    const unsubUrl = `${config.baseUrl}/unsubscribe/${token}`;
    const msg = composeMessage(r, unsubUrl);
    try {
      await sendEmail({
        to: rcpt.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await query(
        `INSERT INTO broadcast_recipients (broadcast_id, subscriber_id, status)
         VALUES ($1, $2, 'sent') ON CONFLICT DO NOTHING`,
        [bc.id, rcpt.id],
      );
      sent++;
    } catch (err) {
      await query(
        `INSERT INTO broadcast_recipients (broadcast_id, subscriber_id, status, error)
         VALUES ($1, $2, 'failed', $3) ON CONFLICT DO NOTHING`,
        [bc.id, rcpt.id, String((err as Error)?.message ?? err)],
      );
      failed++;
    }
    if (config.send.throttleMs > 0) {
      await new Promise((res) => setTimeout(res, config.send.throttleMs));
    }
  }

  await query(
    `UPDATE broadcasts SET status = 'sent', sent_count = $2, sent_at = now()
      WHERE id = $1`,
    [bc.id, sent],
  );

  return {
    broadcastId: bc.id,
    alreadySent: false,
    sent,
    failed,
    recipientCount: recipients.length,
  };
}
