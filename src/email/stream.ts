// Stream transport: builds the full MIME message via Nodemailer (so DKIM signing,
// From, Reply-To, headers are all real) and prints it instead of sending. Useful for
// verifying the per-tenant sending identity + DKIM-Signature without an SMTP server.

import type { EmailMessage, EmailTransport } from "./transport";
import { config } from "../config";

export async function makeStreamTransport(): Promise<EmailTransport> {
  const nodemailer = await import("nodemailer");
  const create =
    (nodemailer as any).default?.createTransport ??
    (nodemailer as any).createTransport;
  const tx = create({ streamTransport: true, newline: "unix", buffer: true });

  return {
    async send(msg: EmailMessage) {
      const info = await tx.sendMail({
        from: msg.from ?? config.email.from,
        to: msg.to,
        replyTo: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        headers: msg.headers,
        dkim: msg.dkim,
      });
      console.log("\n----- MIME (stream transport) -----");
      console.log(info.message.toString());
      console.log("----- end MIME -----\n");
    },
  };
}
