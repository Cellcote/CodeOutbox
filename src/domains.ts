// Agent-automated domain authentication. Generates the SPF / DKIM / DMARC records
// a tenant must publish so broadcasts send from their own authenticated domain,
// and verifies them via DNS. This is the deliverability differentiator: the agent
// drives this to completion (see DELIVERABILITY.md).

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { query, queryOne } from "./db";
import { config } from "./config";
import { encrypt } from "./crypto";

export interface DnsRecord {
  purpose: "SPF" | "DKIM" | "DMARC";
  type: "TXT";
  host: string;
  value: string;
}

export interface DomainRow {
  id: number;
  subdomain: string;
  status: "pending" | "verified" | "failed";
  dkim_selector: string;
  records: string; // JSON string of DnsRecord[]
  verified_at: string | null;
}

function buildRecords(subdomain: string, selector: string, dkimP: string): DnsRecord[] {
  return [
    {
      purpose: "SPF",
      type: "TXT",
      host: subdomain,
      value: `v=spf1 include:${config.domains.spfInclude} ~all`,
    },
    {
      purpose: "DKIM",
      type: "TXT",
      host: `${selector}._domainkey.${subdomain}`,
      value: `v=DKIM1; k=rsa; p=${dkimP}`,
    },
    {
      purpose: "DMARC",
      type: "TXT",
      host: `_dmarc.${subdomain}`,
      value: `v=DMARC1; p=none; rua=mailto:${config.domains.dmarcRua}`,
    },
  ];
}

export async function addDomain(
  accountId: number,
  subdomain: string,
): Promise<{ id: number; records: DnsRecord[] }> {
  const selector = "co" + randomBytes(4).toString("hex");

  // We own the DKIM keypair: the public key goes in the tenant's DNS record; the
  // private key is stored ENCRYPTED so our sender can sign mail for this domain.
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const dkimP = String(publicKey)
    .split("\n")
    .filter((l) => l && !l.startsWith("-----"))
    .join("");

  const records = buildRecords(subdomain, selector, dkimP);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO domains (account_id, subdomain, dkim_selector, dkim_public_key, dkim_private_key, records)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      accountId,
      subdomain,
      selector,
      dkimP,
      encrypt(String(privateKey)),
      JSON.stringify(records),
    ],
  );
  if (!row) throw new Error("failed to create domain");
  return { id: row.id, records };
}

export async function listDomains(accountId: number): Promise<DomainRow[]> {
  return query<DomainRow>(
    `SELECT id, subdomain, status, dkim_selector, records, verified_at
       FROM domains WHERE account_id = $1 ORDER BY id`,
    [accountId],
  );
}

export async function getDomain(
  accountId: number,
  id: number,
): Promise<DomainRow | null> {
  return queryOne<DomainRow>(
    `SELECT id, subdomain, status, dkim_selector, records, verified_at
       FROM domains WHERE id = $1 AND account_id = $2`,
    [id, accountId],
  );
}

export interface VerifyResult {
  status: "verified" | "pending";
  checks: Array<{ purpose: string; host: string; ok: boolean }>;
}

async function recordMatches(r: DnsRecord): Promise<boolean> {
  let flat: string;
  try {
    const records = await resolveTxt(r.host);
    flat = records.map((chunks) => chunks.join("")).join(" ");
  } catch {
    return false;
  }
  if (r.purpose === "DKIM") {
    // DKIM verifiers ignore whitespace in the base64 key (FWS) — and DNS panels
    // routinely inject it into long values — so we strip it before comparing.
    const strip = (s: string) => s.replace(/\s+/g, "");
    const needle = strip(r.value.split("p=")[1] ?? "");
    return needle.length > 0 && strip(flat).includes(needle);
  }
  return flat.includes(r.value);
}

export async function verifyDomain(
  accountId: number,
  id: number,
): Promise<VerifyResult | null> {
  const domain = await getDomain(accountId, id);
  if (!domain) return null;
  const records: DnsRecord[] = JSON.parse(domain.records);

  const checks = await Promise.all(
    records.map(async (r) => ({
      purpose: r.purpose,
      host: r.host,
      // 'mock' assumes the records are published (local/dev demo).
      ok:
        config.domains.verifyMode === "mock" ? true : await recordMatches(r),
    })),
  );

  const allOk = checks.every((c) => c.ok);
  if (allOk) {
    await query(
      `UPDATE domains SET status = 'verified', verified_at = now() WHERE id = $1`,
      [id],
    );
  }
  return { status: allOk ? "verified" : "pending", checks };
}

export async function accountHasVerifiedDomain(
  accountId: number,
): Promise<boolean> {
  const row = await queryOne<{ one: number }>(
    `SELECT 1 AS one FROM domains WHERE account_id = $1 AND status = 'verified' LIMIT 1`,
    [accountId],
  );
  return !!row;
}
