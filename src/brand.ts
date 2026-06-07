// Per-tenant branding for outgoing mail. A broadcast must wear the *tenant's*
// identity (name, domain, accent, logo) — never CodeOutbox's. resolveBrand()
// returns a fully-populated Brand with sensible fallbacks, so a tenant who has
// configured nothing still gets correct branding auto-derived from their verified
// sending domain (e.g. news.highveld.nl → "Highveld" / highveld.nl).

import { query, queryOne } from "./db";

export interface Brand {
  name: string; // header label, e.g. "Highveld"
  domain: string; // footer domain, e.g. "highveld.nl"
  color: string; // accent hex, e.g. "#2E7D32"
  logoUrl: string; // header logo; "" = render the name instead
  poweredBy: boolean; // show "Powered by CodeOutbox" (free plan only)
}

const DEFAULT_ACCENT = "#FFB000";

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

// Registrable domain (naive: last two labels). Good for .com/.nl/etc.; multi-part
// TLDs like .co.uk would over-trim, which is cosmetic here (footer label only).
function rootDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

function titleize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export async function resolveBrand(accountId: number): Promise<Brand> {
  const acct = await queryOne<{
    email: string;
    plan: string;
    brand_name: string | null;
    brand_color: string | null;
    brand_logo_url: string | null;
  }>(
    `SELECT email, plan, brand_name, brand_color, brand_logo_url
       FROM accounts WHERE id = $1`,
    [accountId],
  );
  const verified = await queryOne<{ subdomain: string }>(
    `SELECT subdomain FROM domains
      WHERE account_id = $1 AND status = 'verified' ORDER BY id LIMIT 1`,
    [accountId],
  );

  const domain = verified
    ? rootDomain(verified.subdomain)
    : emailDomain(acct?.email ?? "");
  const name =
    acct?.brand_name?.trim() || titleize(domain.split(".")[0] ?? "") || "Newsletter";

  return {
    name,
    domain,
    color: acct?.brand_color?.trim() || DEFAULT_ACCENT,
    logoUrl: acct?.brand_logo_url?.trim() || "",
    poweredBy: (acct?.plan ?? "free") === "free",
  };
}

export interface BrandInput {
  name?: string | null;
  color?: string | null;
  logoUrl?: string | null;
}

// Partial update — only the provided fields are written.
export async function setBrand(
  accountId: number,
  input: BrandInput,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) {
    sets.push(`brand_name = $${i++}`);
    params.push(input.name);
  }
  if (input.color !== undefined) {
    sets.push(`brand_color = $${i++}`);
    params.push(input.color);
  }
  if (input.logoUrl !== undefined) {
    sets.push(`brand_logo_url = $${i++}`);
    params.push(input.logoUrl);
  }
  if (!sets.length) return;
  params.push(accountId);
  await query(`UPDATE accounts SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
