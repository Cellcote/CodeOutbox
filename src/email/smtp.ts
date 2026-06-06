// SMTP transport via Nodemailer — the self-host default. Works with any relay or
// mailbox (SMTP_URL like smtp://user:pass@host:587).

import type { EmailMessage, EmailTransport } from "./transport";
import { config } from "../config";

export async function makeSmtpTransport(): Promise<EmailTransport> {
  if (!config.email.smtpUrl) {
    throw new Error("EMAIL_TRANSPORT=smtp requires SMTP_URL to be set");
  }
  const nodemailer = await import("nodemailer");
  const create = (nodemailer as any).default?.createTransport ??
    (nodemailer as any).createTransport;
  const tx = create(config.email.smtpUrl);

  return {
    async send(msg: EmailMessage) {
      await tx.sendMail({
        from: msg.from ?? config.email.from,
        to: msg.to,
        replyTo: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        headers: msg.headers,
        dkim: msg.dkim,
      });
    },
  };
}
