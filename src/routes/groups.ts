// Authd control-plane endpoints for groups. The CLI and MCP server wrap these.
//   GET  /v1/groups            → list owned groups with counts
//   POST /v1/groups            → create/update a group you own
//   GET  /v1/groups/:slug/count → confirmed/total counts for an owned group

import type { Context } from "hono";
import { query, queryOne } from "../db";
import { getAccountId } from "../auth";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function listGroups(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const groups = await query<{
    slug: string;
    name: string | null;
    double_opt_in: boolean;
    redirect: string | null;
    total: number;
    confirmed: number;
  }>(
    `SELECT g.slug, g.name, g.double_opt_in, g.redirect,
            COUNT(s.id)::int AS total,
            COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::int AS confirmed
       FROM groups g
       LEFT JOIN subscribers s ON s.group_id = g.id
      WHERE g.owner_account_id = $1
      GROUP BY g.id, g.slug, g.name, g.double_opt_in, g.redirect
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

  // Insert, or update only if this account already owns the slug.
  const row = await queryOne<{ slug: string }>(
    `INSERT INTO groups (slug, name, double_opt_in, redirect, owner_account_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, groups.name),
       double_opt_in = EXCLUDED.double_opt_in,
       redirect = COALESCE(EXCLUDED.redirect, groups.redirect)
     WHERE groups.owner_account_id = $5
     RETURNING slug`,
    [slug, name, doubleOptIn, redirect, accountId],
  );
  if (!row) {
    return c.json(
      { ok: false, error: `slug "${slug}" is taken by another account` },
      409,
    );
  }
  return c.json({ ok: true, slug: row.slug });
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
