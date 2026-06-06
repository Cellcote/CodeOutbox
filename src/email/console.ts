// Dev transport: prints the email to stdout instead of sending it. The confirm
// link is right there in your terminal — no mail server needed to develop.

import type { EmailMessage, EmailTransport } from "./transport";

export function makeConsoleTransport(): EmailTransport {
  return {
    async send(msg: EmailMessage) {
      const line = "=".repeat(74);
      const headerLines = msg.headers
        ? Object.entries(msg.headers)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n") + "\n"
        : "";
      const idLines =
        (msg.from ? `  From:    ${msg.from}\n` : "") +
        (msg.replyTo ? `  Reply-To: ${msg.replyTo}\n` : "") +
        (msg.dkim ? `  DKIM:    d=${msg.dkim.domainName} s=${msg.dkim.keySelector}\n` : "");
      console.log(
        `\n${line}\n` +
          `  EMAIL (console transport)\n` +
          idLines +
          `  To:      ${msg.to}\n` +
          `  Subject: ${msg.subject}\n` +
          headerLines +
          `${"-".repeat(74)}\n` +
          `${msg.text}\n` +
          `${line}\n`,
      );
    },
  };
}
