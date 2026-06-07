// Resolve a tenant's sending identity for a broadcast (the "hybrid identity"):
//   - verified own domain → From their domain, DKIM-signed with their key
//   - otherwise           → From our shared domain, DKIM-signed with the shared key
// We own and sign with the DKIM keys either way (own-MTA model).

import { queryOne } from "./db";
import { decrypt } from "./crypto";
import { config } from "./config";
import { sendEmail, type EmailMessage } from "./email/transport";

export interface DkimConfig {
  domainName: string;
  keySelector: string;
  privateKey: string;
}

export interface Sender {
  from: string;
  replyTo?: string;
  dkim?: DkimConfig;
}

function compose(addr: string, name?: string): string {
  return name ? `${name} <${addr}>` : addr;
}

export async function resolveSender(
  accountId: number,
  displayName?: string,
): Promise<Sender> {
  const acct = await queryOne<{ email: string }>(
    `SELECT email FROM accounts WHERE id = $1`,
    [accountId],
  );
  const replyTo = acct?.email ?? undefined;

  const dom = await queryOne<{
    subdomain: string;
    dkim_selector: string;
    dkim_private_key: string | null;
  }>(
    `SELECT subdomain, dkim_selector, dkim_private_key
       FROM domains
      WHERE account_id = $1 AND status = 'verified'
      ORDER BY id LIMIT 1`,
    [accountId],
  );

  // Verified own domain → send as them.
  if (dom?.dkim_private_key) {
    return {
      from: compose(`noreply@${dom.subdomain}`, displayName),
      replyTo,
      dkim: {
        domainName: dom.subdomain,
        keySelector: dom.dkim_selector,
        privateKey: decrypt(dom.dkim_private_key),
      },
    };
  }

  // Transitional: if we don't yet run our own shared sending domain (no shared DKIM
  // key configured — e.g. still relaying via an ESP), fall back to the global
  // MAIL_FROM and let the relay's own authentication handle it. Once SHARED_DKIM_*
  // is set (our MTA / shared domain), switch to the per-tenant shared identity.
  const sk = config.shared.dkimPrivateKey;
  if (!sk) {
    return { from: config.email.from, replyTo };
  }

  // Shared identity. Per-tenant local part keeps the shared domain segmentable.
  return {
    from: compose(`t${accountId}@${config.shared.domain}`, displayName),
    replyTo,
    dkim: {
      domainName: config.shared.domain,
      keySelector: config.shared.dkimSelector,
      privateKey: sk,
    },
  };
}

// Extract the domain of a From header ("Name <a@b.com>" or "a@b.com").
function addressDomain(from: string): string {
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim();
  return addr.split("@")[1]?.toLowerCase() ?? "";
}

// Identity for CodeOutbox's OWN system mail (sign-in / confirm / claim). Signs
// with the shared DKIM key when the From aligns with the shared domain — so these
// transactional emails pass DKIM (not just SPF/DMARC).
export function systemSender(): Sender {
  const from = config.email.from;
  const sk = config.shared.dkimPrivateKey;
  if (sk && addressDomain(from) === config.shared.domain.toLowerCase()) {
    return {
      from,
      dkim: {
        domainName: config.shared.domain,
        keySelector: config.shared.dkimSelector,
        privateKey: sk,
      },
    };
  }
  return { from };
}

export async function sendSystemEmail(msg: EmailMessage): Promise<void> {
  const s = systemSender();
  await sendEmail({ ...msg, from: s.from, dkim: s.dkim });
}
