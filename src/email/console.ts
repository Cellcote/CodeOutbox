// Dev transport: prints the email to stdout instead of sending it. The confirm
// link is right there in your terminal — no mail server needed to develop.

import type { EmailMessage, EmailTransport } from "./transport";

export function makeConsoleTransport(): EmailTransport {
  return {
    async send(msg: EmailMessage) {
      const line = "=".repeat(74);
      console.log(
        `\n${line}\n` +
          `  EMAIL (console transport)\n` +
          `  To:      ${msg.to}\n` +
          `  Subject: ${msg.subject}\n` +
          `${"-".repeat(74)}\n` +
          `${msg.text}\n` +
          `${line}\n`,
      );
    },
  };
}
