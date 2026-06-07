// CodeOutbox's own system emails (sign-in / confirm / claim). Plain-text-first for
// deliverability, with a branded HTML part using the shared shell + the real
// CodeOutbox masthead (amber [↑] on the dark bar).

import type { EmailMessage } from "./transport";
import { emailShell, codeoutboxMasthead, escapeHtml } from "./shell";

interface SystemEmail {
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  preheader: string;
}

function renderSystem(o: SystemEmail): string {
  const body =
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0A0A0A">${o.heading}</h1>` +
    `<p style="margin:0 0 22px;color:#333333">${o.intro}</p>` +
    `<p style="margin:0 0 22px">` +
    `<a href="${o.ctaUrl}" style="display:inline-block;padding:12px 22px;background:#F59E0B;color:#0A0A0A;border-radius:8px;text-decoration:none;font-weight:600">${o.ctaLabel}</a>` +
    `</p>` +
    `<p style="margin:0 0 4px;color:#888888;font-size:13px">Or paste this link into your browser:</p>` +
    `<p style="margin:0 0 22px;font-size:13px"><a href="${o.ctaUrl}" style="color:#888888;word-break:break-all">${o.ctaUrl}</a></p>` +
    `<p style="margin:0;color:#888888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`;
  return emailShell({
    masthead: codeoutboxMasthead(),
    headerBg: "#0A0A0A",
    accent: "#F59E0B",
    bodyHtml: body,
    footerHtml: `CodeOutbox · email that lives in your codebase`,
    preheader: o.preheader,
  });
}

export function confirmEmail(to: string, confirmUrl: string): EmailMessage {
  const subject = "Confirm your subscription";
  const text =
    `Thanks for subscribing!\n\n` +
    `Please confirm your email by opening this link:\n${confirmUrl}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html = renderSystem({
    heading: "Confirm your subscription",
    intro: "Thanks for subscribing! Tap below to confirm your email address.",
    ctaLabel: "Confirm subscription",
    ctaUrl: confirmUrl,
    preheader: "Confirm your email to finish subscribing.",
  });
  return { to, subject, text, html };
}

export function loginEmail(to: string, url: string): EmailMessage {
  const subject = "Your CodeOutbox sign-in link";
  const text =
    `Open this link to sign in to CodeOutbox and get your API key:\n${url}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html = renderSystem({
    heading: "Sign in to CodeOutbox",
    intro: "Tap below to open your dashboard and get your API key.",
    ctaLabel: "Sign in",
    ctaUrl: url,
    preheader: "Your sign-in link for CodeOutbox.",
  });
  return { to, subject, text, html };
}

export function claimEmail(
  to: string,
  slug: string,
  claimUrl: string,
): EmailMessage {
  const subject = `Claim your "${slug}" list`;
  const text =
    `You're claiming the "${slug}" subscriber list on CodeOutbox.\n\n` +
    `Open this link to claim it and open your dashboard:\n${claimUrl}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html = renderSystem({
    heading: `Claim your &ldquo;${escapeHtml(slug)}&rdquo; list`,
    intro: "Tap below to take ownership of this list and open your dashboard.",
    ctaLabel: "Claim list",
    ctaUrl: claimUrl,
    preheader: `Take ownership of the "${slug}" list on CodeOutbox.`,
  });
  return { to, subject, text, html };
}
