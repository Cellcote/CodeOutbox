// Pluggable email transport. Default "console" prints to stdout (dev), "smtp"
// sends via any relay (the self-host default). Postmark/SES adapters slot in here
// later behind the same interface — nothing else in the app changes.

import { config } from "../config";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string; // overrides the global default (per-tenant sending identity)
  replyTo?: string;
  returnPath?: string; // VERP envelope sender, so bounces identify the recipient
  headers?: Record<string, string>;
  dkim?: { domainName: string; keySelector: string; privateKey: string };
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

let transport: EmailTransport | null = null;

export async function getTransport(): Promise<EmailTransport> {
  if (transport) return transport;
  if (config.email.transport === "smtp") {
    const { makeSmtpTransport } = await import("./smtp");
    transport = await makeSmtpTransport();
  } else if (config.email.transport === "stream") {
    const { makeStreamTransport } = await import("./stream");
    transport = await makeStreamTransport();
  } else {
    const { makeConsoleTransport } = await import("./console");
    transport = makeConsoleTransport();
  }
  return transport;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const t = await getTransport();
  await t.send(msg);
}
