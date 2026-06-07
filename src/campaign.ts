// Campaign parsing + rendering. A campaign file is YAML-ish frontmatter followed
// by a Markdown body. We render the body once to HTML (marked) and keep the raw
// Markdown as the plain-text part (good for deliverability). The per-recipient
// unsubscribe footer is injected later by composeMessage().

import { marked } from "marked";
import type { Brand } from "./brand";

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
  brand: Brand,
): ComposedMessage {
  const pre = r.meta.preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(
        r.meta.preheader,
      )}</span>`
    : "";
  const sans = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  // Trust nothing from storage: accent must be a hex color; logo must be https.
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(brand.color) ? brand.color : "#FFB000";
  const name = escapeHtml(brand.name || "Newsletter");
  const masthead =
    brand.logoUrl && /^https:\/\//i.test(brand.logoUrl)
      ? `<img src="${escapeAttr(brand.logoUrl)}" alt="${name}" height="28" style="height:28px;max-height:28px;display:block;border:0">`
      : `<span style="font-family:${sans};font-size:19px;font-weight:700;color:#111111">${name}</span>`;
  const powered = brand.poweredBy
    ? `<div style="max-width:560px;font-family:${sans};font-size:11px;color:#bbbbbb;padding:14px 4px">Powered by <a href="https://codeoutbox.com" style="color:#bbbbbb">CodeOutbox</a></div>`
    : "";

  const html =
    `<div style="background:#f4f4f5;margin:0;padding:0">` +
    pre +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden">` +
    // header — tenant masthead with their accent rule
    `<tr><td style="padding:20px 28px;border-bottom:3px solid ${accent}">${masthead}</td></tr>` +
    // body
    `<tr><td style="padding:28px;font-family:${sans};font-size:16px;line-height:1.6;color:#111111">` +
    r.bodyHtml +
    `</td></tr>` +
    // footer
    `<tr><td style="padding:18px 28px;border-top:1px solid #eeeeee;font-family:${sans};font-size:12px;color:#999999">` +
    `You're receiving this because you subscribed at ${escapeHtml(brand.domain)}.<br>` +
    `<a href="${unsubUrl}" style="color:#999999;text-decoration:underline">Unsubscribe</a></td></tr>` +
    `</table>` +
    powered +
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

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
