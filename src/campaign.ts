// Campaign parsing + rendering. A campaign file is YAML-ish frontmatter followed
// by a Markdown body. We render the body once to HTML (marked) and keep the raw
// Markdown as the plain-text part (good for deliverability). The per-recipient
// unsubscribe footer is injected later by composeMessage().

import { marked } from "marked";

export interface CampaignMeta {
  subject: string;
  group: string;
  preheader?: string;
  from?: string;
  sendAt?: string;
}

export interface RenderedCampaign {
  meta: CampaignMeta;
  bodyHtml: string;
  bodyText: string;
}

export interface ComposedMessage {
  subject: string;
  html: string;
  text: string;
}

export function parseCampaign(source: string): RenderedCampaign {
  const fm: Record<string, string> = {};
  let body = source;

  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(source);
  if (m) {
    body = source.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) fm[key] = val;
    }
  }

  if (!fm.subject) throw new Error("campaign frontmatter missing 'subject'");
  if (!fm.group) throw new Error("campaign frontmatter missing 'group'");

  const meta: CampaignMeta = {
    subject: fm.subject,
    group: fm.group,
    preheader: fm.preheader,
    from: fm.from,
    sendAt: fm.send_at,
  };

  const bodyText = body.trim();
  const bodyHtml = marked.parse(bodyText, { async: false }) as string;
  return { meta, bodyHtml, bodyText };
}

export function composeMessage(
  r: RenderedCampaign,
  unsubUrl: string,
): ComposedMessage {
  const pre = r.meta.preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(
        r.meta.preheader,
      )}</span>`
    : "";
  const html =
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:auto;color:#111;line-height:1.5">` +
    pre +
    r.bodyHtml +
    `<hr style="border:0;border-top:1px solid #eee;margin:32px 0 12px">` +
    `<p style="color:#888;font-size:12px">You're receiving this because you subscribed. ` +
    `<a href="${unsubUrl}" style="color:#888">Unsubscribe</a>.</p>` +
    `</div>`;
  const text = `${r.bodyText}\n\n—\nUnsubscribe: ${unsubUrl}\n`;
  return { subject: r.meta.subject, html, text };
}

// Lightweight pre-send deliverability lint. Warnings, not hard blocks.
export function lintCampaign(r: RenderedCampaign): string[] {
  const warnings: string[] = [];
  const imgCount = (r.bodyHtml.match(/<img\b/gi) ?? []).length;
  const textLen = r.bodyText.replace(/\s+/g, " ").trim().length;

  if (textLen < 40) {
    warnings.push("Body is very short — thin content can hurt deliverability.");
  }
  if (imgCount > 0 && textLen < imgCount * 200) {
    warnings.push(
      `Image-heavy (${imgCount} image(s) vs ${textLen} chars of text) — balance images with text.`,
    );
  }
  const shortener = /\b(bit\.ly|t\.co|tinyurl\.com|goo\.gl|ow\.ly)\b/i;
  if (shortener.test(r.bodyText)) {
    warnings.push("Contains link shorteners — these often trigger spam filters.");
  }
  return warnings;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
