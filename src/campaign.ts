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
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(
        r.meta.preheader,
      )}</span>`
    : "";
  const mono = "'JetBrains Mono',Consolas,Menlo,monospace";
  const sans = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html =
    `<div style="background:#f4f4f5;margin:0;padding:0">` +
    pre +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden">` +
    // header
    `<tr><td style="background:#0A0A0A;padding:18px 28px">` +
    `<span style="font-family:${mono};font-size:18px;font-weight:600;color:#fafafa;letter-spacing:-0.5px">` +
    `<span style="color:#FFB000">[&#8593;]</span> CodeOutbox</span></td></tr>` +
    // body
    `<tr><td style="padding:28px;font-family:${sans};font-size:16px;line-height:1.6;color:#111111">` +
    r.bodyHtml +
    `</td></tr>` +
    // footer
    `<tr><td style="padding:18px 28px;border-top:1px solid #eeeeee;font-family:${mono};font-size:12px;color:#999999">` +
    `You're receiving this because you subscribed at codeoutbox.com.<br>` +
    `<a href="${unsubUrl}" style="color:#999999;text-decoration:underline">Unsubscribe</a></td></tr>` +
    `</table>` +
    `<div style="max-width:560px;font-family:${mono};font-size:11px;color:#bbbbbb;padding:14px 4px">CodeOutbox · email that lives in your codebase</div>` +
    `</td></tr></table></div>`;
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
