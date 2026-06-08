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
import { resolveSender } from "./sender";
import { resolveBrand } from "./brand";
import { enforceWarmup, warmupStatus } from "./warmup";
import { injectTracking } from "./tracking";
import { enqueue } from "./queue";
import { verpAddress } from "./verp";
import { sendUsage } from "./usage";
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
  queued: boolean;
  scheduledFor?: string; // ISO time if scheduled for the future
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
  const brand = await resolveBrand(accountId);
  const sample = composeMessage(r, `${config.baseUrl}/unsubscribe/SAMPLE`, brand);

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
  const su = await sendUsage(accountId);
  const after = su.used + recipients.length;
  if (after > su.limit) {
    warnings.push(
      `Over monthly send allowance: ${su.used}/${su.limit} used, this needs ${recipients.length}. Upgrade your plan.`,
    );
  } else if (Number.isFinite(su.limit) && after >= su.limit * 0.8) {
    warnings.push(`Approaching send allowance: ${after}/${su.limit} after this send.`);
  }

  const w = await warmupStatus();
  if (w.active && w.remaining !== null && recipients.length > w.remaining) {
    warnings.push(
      `Warmup cap: day ${w.day} allows ${w.cap}/day (${w.usedToday} sent today). ` +
        `This send of ${recipients.length} exceeds the remaining ${w.remaining} — split it across days.`,
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

// Per-broadcast recipients not yet attempted — lets delivery resume after a crash.
async function loadPendingRecipients(
  groupId: number,
  accountId: number,
  broadcastId: number,
): Promise<Recipient[]> {
  return query<Recipient>(
    `SELECT s.id, s.email
       FROM subscribers s
      WHERE s.group_id = $1
        AND s.status = 'confirmed'
        AND NOT EXISTS (SELECT 1 FROM suppressions sup
                         WHERE sup.account_id = $2 AND sup.email = s.email)
        AND NOT EXISTS (SELECT 1 FROM broadcast_recipients br
                         WHERE br.broadcast_id = $3 AND br.subscriber_id = s.id)
      ORDER BY s.id`,
    [groupId, accountId, broadcastId],
  );
}

// The delivery loop. Resumable (only un-attempted recipients) and idempotent, so
// the queue can safely retry it. Used directly for immediate sends and via the
// queue handler for scheduled ones.
async function deliver(
  broadcastId: number,
  source: string,
): Promise<{ sent: number; failed: number }> {
  const bc = await queryOne<{ account_id: number; group_id: number; status: string }>(
    `SELECT account_id, group_id, status FROM broadcasts WHERE id = $1`,
    [broadcastId],
  );
  if (!bc || bc.status === "sent") return { sent: 0, failed: 0 };
  await query(`UPDATE broadcasts SET status = 'sending' WHERE id = $1`, [broadcastId]);

  const r = parseCampaign(source);
  const recipients = await loadPendingRecipients(bc.group_id, bc.account_id, broadcastId);
  const displayName =
    r.meta.from && !r.meta.from.includes("@") ? r.meta.from : undefined;
  const sender = await resolveSender(bc.account_id, displayName);
  const brand = await resolveBrand(bc.account_id);

  let sent = 0;
  let failed = 0;
  for (const rcpt of recipients) {
    const token = await signUnsub(rcpt.id);
    const unsubUrl = `${config.baseUrl}/unsubscribe/${token}`;
    const msg = composeMessage(r, unsubUrl, brand);
    const html = injectTracking(msg.html, broadcastId, rcpt.id, new Set([unsubUrl]));
    try {
      await sendEmail({
        to: rcpt.email,
        from: sender.from,
        replyTo: sender.replyTo,
        returnPath: verpAddress(broadcastId, rcpt.id),
        dkim: sender.dkim,
        subject: msg.subject,
        html,
        text: msg.text,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await query(
        `INSERT INTO broadcast_recipients (broadcast_id, subscriber_id, status)
         VALUES ($1, $2, 'sent') ON CONFLICT DO NOTHING`,
        [broadcastId, rcpt.id],
      );
      sent++;
    } catch (err) {
      await query(
        `INSERT INTO broadcast_recipients (broadcast_id, subscriber_id, status, error)
         VALUES ($1, $2, 'failed', $3) ON CONFLICT DO NOTHING`,
        [broadcastId, rcpt.id, String((err as Error)?.message ?? err)],
      );
      failed++;
    }
    if (config.send.throttleMs > 0) {
      await new Promise((res) => setTimeout(res, config.send.throttleMs));
    }
  }

  const total = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM broadcast_recipients WHERE broadcast_id = $1 AND status = 'sent'`,
    [broadcastId],
  );
  await query(
    `UPDATE broadcasts SET status = 'sent', sent_count = $2, sent_at = now() WHERE id = $1`,
    [broadcastId, total?.n ?? sent],
  );
  return { sent, failed };
}

// Queue handler (registered in index.ts) — runs scheduled broadcasts when due.
export async function runBroadcastJob(payload: {
  broadcastId: number;
  source: string;
}): Promise<void> {
  await deliver(payload.broadcastId, payload.source);
}

export async function sendBroadcast(
  source: string,
  accountId: number,
): Promise<SendResult> {
  const r = parseCampaign(source);
  const group = await resolveOwnedGroup(r.meta.group, accountId);
  const hash = contentHash(r);

  // Idempotency: same content already sending/scheduled/sent → no double-send.
  const existing = await queryOne<{ id: number; sent_count: number }>(
    `SELECT id, sent_count FROM broadcasts
      WHERE group_id = $1 AND content_hash = $2 AND status IN ('sending','scheduled','sent')
      ORDER BY id DESC LIMIT 1`,
    [group.id, hash],
  );
  if (existing) {
    return {
      broadcastId: existing.id,
      alreadySent: true,
      queued: false,
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

  // Plan: monthly send allowance.
  const su = await sendUsage(accountId);
  if (su.used + recipients.length > su.limit) {
    throw new Error(
      `monthly send allowance exceeded: ${su.used}/${su.limit} used this month, ` +
        `this broadcast needs ${recipients.length}. Upgrade your plan to send more.`,
    );
  }

  // IP warmup: keep daily volume under the ramp while the sending IP is new.
  await enforceWarmup(recipients.length);

  // Scheduled for the future (send_at frontmatter)? Queue it. Otherwise deliver now.
  const at = r.meta.sendAt ? new Date(r.meta.sendAt) : null;
  const scheduled = !!(at && !isNaN(at.getTime()) && at.getTime() > Date.now());

  const bc = await queryOne<{ id: number }>(
    `INSERT INTO broadcasts (account_id, group_id, subject, content_hash, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [accountId, group.id, r.meta.subject, hash, scheduled ? "scheduled" : "sending"],
  );
  if (!bc) throw new Error("failed to create broadcast");

  if (scheduled) {
    await enqueue("broadcast.send", { broadcastId: bc.id, source }, at!);
    return {
      broadcastId: bc.id,
      alreadySent: false,
      queued: true,
      scheduledFor: at!.toISOString(),
      sent: 0,
      failed: 0,
      recipientCount: recipients.length,
    };
  }

  const res = await deliver(bc.id, source);
  return {
    broadcastId: bc.id,
    alreadySent: false,
    queued: false,
    sent: res.sent,
    failed: res.failed,
    recipientCount: recipients.length,
  };
}

export interface BroadcastSummary {
  id: number;
  subject: string;
  group: string;
  status: string;
  sent: number;
  opens: number;
  clicks: number;
  bounced: number;
  complained: number;
  sent_at: string | null;
}

export async function listBroadcasts(
  accountId: number,
  limit = 20,
): Promise<BroadcastSummary[]> {
  const rows = await query<{
    id: number;
    subject: string;
    slug: string;
    status: string;
    sent_count: number;
    bounced_count: number;
    complained_count: number;
    sent_at: string | null;
    opens: string;
    clicks: string;
  }>(
    `SELECT b.id, b.subject, g.slug, b.status, b.sent_count,
            COALESCE(b.bounced_count, 0)    AS bounced_count,
            COALESCE(b.complained_count, 0) AS complained_count,
            b.sent_at,
            (SELECT COUNT(DISTINCT subscriber_id) FROM tracking_events te
              WHERE te.broadcast_id = b.id AND te.type = 'open')  AS opens,
            (SELECT COUNT(DISTINCT subscriber_id) FROM tracking_events te
              WHERE te.broadcast_id = b.id AND te.type = 'click') AS clicks
       FROM broadcasts b JOIN groups g ON g.id = b.group_id
      WHERE b.account_id = $1 AND b.status IN ('scheduled','sending','sent')
      ORDER BY b.id DESC LIMIT $2`,
    [accountId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    group: r.slug,
    status: r.status,
    sent: Number(r.sent_count),
    opens: Number(r.opens),
    clicks: Number(r.clicks),
    bounced: Number(r.bounced_count),
    complained: Number(r.complained_count),
    sent_at: r.sent_at,
  }));
}

// Send a single test copy to the account's own email — no broadcast record, no
// metering, no tracking. Lets you preview the real rendered email before sending.
export async function sendTest(
  source: string,
  accountId: number,
): Promise<{ to: string }> {
  const r = parseCampaign(source);
  await resolveOwnedGroup(r.meta.group, accountId); // validates the list is yours
  const acct = await queryOne<{ email: string }>(
    `SELECT email FROM accounts WHERE id = $1`,
    [accountId],
  );
  if (!acct?.email) throw new Error("account email not found");
  const displayName =
    r.meta.from && !r.meta.from.includes("@") ? r.meta.from : undefined;
  const sender = await resolveSender(accountId, displayName);
  const brand = await resolveBrand(accountId);
  const unsubUrl = `${config.baseUrl}/unsubscribe/TEST`;
  const msg = composeMessage(r, unsubUrl, brand);
  await sendEmail({
    to: acct.email,
    from: sender.from,
    replyTo: sender.replyTo,
    dkim: sender.dkim,
    subject: `[Test] ${msg.subject}`,
    html: msg.html,
    text: msg.text,
    headers: { "List-Unsubscribe": `<${unsubUrl}>` },
  });
  return { to: acct.email };
}

export interface BroadcastDetail extends BroadcastSummary {
  status: string;
  topLinks: { url: string; clicks: number }[];
}

export async function broadcastDetail(
  accountId: number,
  broadcastId: number,
): Promise<BroadcastDetail | null> {
  const bc = await queryOne<{
    id: number;
    subject: string;
    slug: string;
    status: string;
    sent_count: number;
    bounced_count: number;
    complained_count: number;
    sent_at: string | null;
    opens: string;
    clicks: string;
  }>(
    `SELECT b.id, b.subject, g.slug, b.status, b.sent_count,
            COALESCE(b.bounced_count,0) AS bounced_count,
            COALESCE(b.complained_count,0) AS complained_count, b.sent_at,
            (SELECT COUNT(DISTINCT subscriber_id) FROM tracking_events te WHERE te.broadcast_id=b.id AND te.type='open')  AS opens,
            (SELECT COUNT(DISTINCT subscriber_id) FROM tracking_events te WHERE te.broadcast_id=b.id AND te.type='click') AS clicks
       FROM broadcasts b JOIN groups g ON g.id = b.group_id
      WHERE b.id = $1 AND b.account_id = $2`,
    [broadcastId, accountId],
  );
  if (!bc) return null;
  const links = await query<{ url: string; clicks: number }>(
    `SELECT url, COUNT(DISTINCT subscriber_id)::int AS clicks
       FROM tracking_events
      WHERE broadcast_id = $1 AND type = 'click' AND url IS NOT NULL
      GROUP BY url ORDER BY clicks DESC LIMIT 10`,
    [broadcastId],
  );
  return {
    id: bc.id,
    subject: bc.subject,
    group: bc.slug,
    status: bc.status,
    sent: Number(bc.sent_count),
    opens: Number(bc.opens),
    clicks: Number(bc.clicks),
    bounced: Number(bc.bounced_count),
    complained: Number(bc.complained_count),
    sent_at: bc.sent_at,
    topLinks: links.map((l) => ({ url: l.url, clicks: Number(l.clicks) })),
  };
}
