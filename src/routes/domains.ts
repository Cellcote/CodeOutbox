// Authd domain-auth endpoints (wrapped by the co CLI and MCP).
//   POST /v1/domains            → add domain, returns SPF/DKIM/DMARC records
//   GET  /v1/domains            → list domains + status
//   GET  /v1/domains/:id        → one domain + records
//   POST /v1/domains/:id/verify → check DNS, flip to verified when aligned

import type { Context } from "hono";
import { getAccountId } from "../auth";
import {
  addDomain,
  listDomains,
  getDomain,
  verifyDomain,
} from "../domains";

const SUBDOMAIN_RE = /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

export async function addDomainEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const subdomain = String(body.subdomain ?? "").trim().toLowerCase();
  if (!SUBDOMAIN_RE.test(subdomain)) {
    return c.json({ ok: false, error: "invalid subdomain" }, 400);
  }
  try {
    const { id, records } = await addDomain(accountId, subdomain);
    return c.json({ ok: true, id, subdomain, status: "pending", records });
  } catch (err) {
    // Most likely a UNIQUE violation on subdomain.
    return c.json(
      { ok: false, error: `could not add domain: ${(err as Error).message}` },
      400,
    );
  }
}

export async function listDomainsEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const domains = (await listDomains(accountId)).map((d) => ({
    id: d.id,
    subdomain: d.subdomain,
    status: d.status,
    verified_at: d.verified_at,
  }));
  return c.json({ ok: true, domains });
}

export async function getDomainEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const d = await getDomain(accountId, id);
  if (!d) return c.json({ ok: false, error: "domain not found" }, 404);
  return c.json({
    ok: true,
    id: d.id,
    subdomain: d.subdomain,
    status: d.status,
    records: JSON.parse(d.records),
    verified_at: d.verified_at,
  });
}

export async function verifyDomainEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const id = Number(c.req.param("id"));
  const result = await verifyDomain(accountId, id);
  if (!result) return c.json({ ok: false, error: "domain not found" }, 404);
  return c.json({ ok: true, ...result });
}
