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

// Zero-signup: the first confirmed subscriber on a provisional list is the moment
// the developer has felt the value — that's when we ask them to claim it. Written
// as a win, not a system notice.
export function firstSubscriberEmail(
  to: string,
  list: string,
  claimUrl: string,
  expiresOn: string,
  reader: string, // masked, e.g. j•••@gmail.com
): EmailMessage {
  const subject = `Someone just subscribed to ${list}`;
  const text =
    `Your form works. ${reader} just confirmed their subscription to ${list}. That's your first reader.\n\n` +
    `Claim the list to keep them and send your first email. It's free and takes one click:\n${claimUrl}\n\n` +
    `Lists that aren't claimed are removed on ${expiresOn}, along with their subscribers.`;
  const body =
    `<p style="margin:0 0 4px;font-size:44px;line-height:1;font-weight:700;color:#0A0A0A">1</p>` +
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0A0A0A">Your form works.</h1>` +
    `<p style="margin:0 0 12px;color:#333333"><strong>${escapeHtml(reader)}</strong> just confirmed their subscription to <strong>${escapeHtml(list)}</strong>. That&rsquo;s your first reader.</p>` +
    `<p style="margin:0 0 22px;color:#333333">Claim the list to keep them and send your first email. It&rsquo;s free and takes one click.</p>` +
    `<p style="margin:0 0 22px"><a href="${claimUrl}" style="display:inline-block;padding:12px 22px;background:#F59E0B;color:#0A0A0A;border-radius:8px;text-decoration:none;font-weight:600">Claim my list</a></p>` +
    `<p style="margin:0;color:#888888;font-size:13px">Lists that aren&rsquo;t claimed are removed on ${escapeHtml(expiresOn)}, along with their subscribers.</p>`;
  const html = emailShell({
    masthead: codeoutboxMasthead(),
    headerBg: "#0A0A0A",
    accent: "#F59E0B",
    bodyHtml: body,
    footerHtml: `CodeOutbox · email that lives in your codebase`,
    preheader: `${reader} subscribed. Claim ${list} to keep them.`,
  });
  return { to, subject, text, html };
}

// Readable text on a tenant's accent: dark ink on light accents, white on dark ones.
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#111111" : "#ffffff";
}

export interface ListLook {
  name: string;
  color: string;
  logoUrl: string;
}

// The double-opt-in email a reader gets. It wears the LIST's identity (they signed
// up for "Your Website Weekly", not for CodeOutbox), with us credited once in the footer.
export function optInEmail(
  to: string,
  confirmUrl: string,
  list: ListLook,
  reminder = false,
): EmailMessage {
  const name = list.name || "this newsletter";
  const subject = reminder
    ? `Still want ${name}? Confirm your subscription`
    : `Confirm your subscription to ${name}`;
  const lead = reminder
    ? `You started subscribing to ${name} but haven't confirmed yet. One tap and you're in.`
    : `You asked to get ${name} by email. Confirm below and the next issue comes straight to your inbox.`;
  const text =
    `${lead}\n\nConfirm: ${confirmUrl}\n\n` +
    `Didn't sign up? Ignore this email and you won't hear from us again.`;
  const sans = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(list.color) ? list.color : "#F59E0B";
  const masthead =
    list.logoUrl && /^https:\/\//i.test(list.logoUrl)
      ? `<img src="${escapeHtml(list.logoUrl)}" alt="${escapeHtml(name)}" height="28" style="height:28px;max-height:28px;display:block;border:0">`
      : `<span style="font-family:${sans};font-size:19px;font-weight:700;color:#111111">${escapeHtml(name)}</span>`;
  const body =
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111111">${reminder ? "Still interested?" : "One tap and you&rsquo;re in"}</h1>` +
    `<p style="margin:0 0 22px;color:#333333">${escapeHtml(lead).replace(escapeHtml(name), `<strong>${escapeHtml(name)}</strong>`)}</p>` +
    `<p style="margin:0 0 22px"><a href="${confirmUrl}" style="display:inline-block;padding:12px 22px;background:${accent};color:${inkOn(accent)};border-radius:8px;text-decoration:none;font-weight:600">Yes, subscribe me</a></p>` +
    `<p style="margin:0;color:#888888;font-size:13px">Didn&rsquo;t sign up? Ignore this email and you won&rsquo;t hear from us again.</p>`;
  const html = emailShell({
    masthead,
    accent,
    bodyHtml: body,
    footerHtml: `${escapeHtml(name)} · sent with <a href="https://codeoutbox.com" style="color:#999999">CodeOutbox</a>`,
    preheader: reminder ? `Confirm your subscription to ${name}.` : `One tap to confirm your subscription to ${name}.`,
  });
  return { to, subject, text, html };
}
