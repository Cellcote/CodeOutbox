// Shared plumbing for automations (welcome, sequence, API triggers): render a
// Markdown letter with the account's brand + sender and deliver it.

import { parseCampaign, composeMessage } from "./campaign";
import { signUnsub } from "./tokens";
import { sendEmail } from "./email/transport";
import { resolveSender } from "./sender";
import { resolveBrand } from "./brand";
import { verpAddress } from "./verp";
import { config } from "./config";

// "3d" / "12h" / "30m" / "45" → minutes. 0 on anything unparseable.
export function parseDelay(s: string): number {
  const m = String(s).trim().match(/^(\d+)\s*([dhm]?)$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "d") return n * 1440;
  if (unit === "h") return n * 60;
  return n; // bare or "m" = minutes
}

export function humanDelay(minutes: number): string {
  if (minutes <= 0) return "immediately";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

// {{key}} interpolation from a flat data object (used by API triggers).
export function interpolate(s: string, data: Record<string, unknown>): string {
  return String(s).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = data?.[k];
    return v == null ? "" : String(v);
  });
}

function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from.trim();
}

// Render a Markdown letter (subject + body) and send it to one recipient.
// subscriberId (when present) adds the one-click unsubscribe token + VERP.
export async function sendRendered(opts: {
  ownerAccountId: number;
  to: string;
  subject: string;
  body: string;
  subscriberId?: number;
}): Promise<void> {
  const subject = String(opts.subject || "Hello").replace(/"/g, '\\"');
  const source = `---\nsubject: "${subject}"\ngroup: automation\n---\n${opts.body}`;
  const r = parseCampaign(source);
  const sender = await resolveSender(opts.ownerAccountId);
  const brand = await resolveBrand(opts.ownerAccountId);

  const headers: Record<string, string> = {};
  let unsubUrl: string;
  let returnPath: string | undefined;
  if (opts.subscriberId) {
    const token = await signUnsub(opts.subscriberId);
    unsubUrl = `${config.baseUrl}/unsubscribe/${token}`;
    returnPath = verpAddress(0, opts.subscriberId);
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  } else {
    // No subscriber context (API trigger to an arbitrary address): mailto unsub.
    unsubUrl = `mailto:${addressOf(sender.from)}?subject=unsubscribe`;
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
  }

  const msg = composeMessage(r, unsubUrl, brand);
  await sendEmail({
    to: opts.to,
    from: sender.from,
    replyTo: sender.replyTo,
    returnPath,
    dkim: sender.dkim,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    headers,
  });
}
