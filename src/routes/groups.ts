// Authd control-plane endpoints for groups. The CLI and MCP server wrap these.
//   GET  /v1/groups            → list owned groups with counts
//   POST /v1/groups            → create/update a group you own
//   GET  /v1/groups/:slug/count → confirmed/total counts for an owned group

import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { query, queryOne } from "../db";
import { getAccountId } from "../auth";
import { config } from "../config";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function listGroups(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const groups = await query<{
    slug: string;
    public_id: string;
    name: string | null;
    double_opt_in: boolean;
    redirect: string | null;
    total: number;
    confirmed: number;
  }>(
    `SELECT g.slug, g.public_id, g.name, g.double_opt_in, g.redirect,
            COUNT(s.id)::int AS total,
            COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::int AS confirmed
       FROM groups g
       LEFT JOIN subscribers s ON s.group_id = g.id
      WHERE g.owner_account_id = $1
      GROUP BY g.id, g.slug, g.public_id, g.name, g.double_opt_in, g.redirect
      ORDER BY g.slug`,
    [accountId],
  );
  return c.json({ ok: true, groups });
}

export async function createGroup(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const slug = String(body.slug ?? "").trim();
  const name = body.name != null ? String(body.name) : null;
  const doubleOptIn = body.doubleOptIn !== false; // default true
  const redirect = body.redirect != null ? String(body.redirect) : null;

  if (!SLUG_RE.test(slug)) {
    return c.json(
      { ok: false, error: "slug must be lowercase letters, numbers, hyphens" },
      400,
    );
  }

  // Slugs are namespaced per account, so two tenants can both have "newsletter".
  // The public form endpoint uses an unguessable public_id, not the slug.
  const publicId = randomBytes(6).toString("base64url");
  const row = await queryOne<{ slug: string; public_id: string }>(
    `INSERT INTO groups (slug, name, double_opt_in, redirect, owner_account_id, public_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (owner_account_id, slug) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, groups.name),
       double_opt_in = EXCLUDED.double_opt_in,
       redirect = COALESCE(EXCLUDED.redirect, groups.redirect)
     RETURNING slug, public_id`,
    [slug, name, doubleOptIn, redirect, accountId, publicId],
  );
  if (!row) return c.json({ ok: false, error: "create failed" }, 500);
  return c.json({
    ok: true,
    slug: row.slug,
    public_id: row.public_id,
    form_url: `${config.baseUrl}/f/${row.public_id}`,
  });
}

export async function groupCount(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const slug = c.req.param("slug");
  const row = await queryOne<{ total: number; confirmed: number }>(
    `SELECT COUNT(s.id)::int AS total,
            COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::int AS confirmed
       FROM groups g
       LEFT JOIN subscribers s ON s.group_id = g.id
      WHERE g.slug = $1 AND g.owner_account_id = $2
      GROUP BY g.id`,
    [slug, accountId],
  );
  if (!row) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true, slug, ...row });
}
