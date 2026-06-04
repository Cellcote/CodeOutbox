// Email content. Minimal, plain-text-first (good for deliverability), with a
// simple HTML part. Always multipart.

import type { EmailMessage } from "./transport";

export function confirmEmail(to: string, confirmUrl: string): EmailMessage {
  const subject = "Confirm your subscription";
  const text =
    `Thanks for subscribing!\n\n` +
    `Please confirm your email by opening this link:\n${confirmUrl}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">` +
    `<h2>Confirm your subscription</h2>` +
    `<p>Thanks for subscribing! Please confirm your email:</p>` +
    `<p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;` +
    `background:#111;color:#fff;border-radius:8px;text-decoration:none">Confirm</a></p>` +
    `<p style="color:#666;font-size:13px">If you didn't request this, ignore this email.</p>` +
    `</div>`;
  return { to, subject, text, html };
}
