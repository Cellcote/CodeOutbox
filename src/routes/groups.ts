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
    archive_public: boolean;
    total: number;
    confirmed: number;
  }>(
    `SELECT g.slug, g.public_id, g.name, g.double_opt_in, g.redirect, g.archive_public,
            COUNT(s.id)::int AS total,
            COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::int AS confirmed
       FROM groups g
       LEFT JOIN subscribers s ON s.group_id = g.id
      WHERE g.owner_account_id = $1
      GROUP BY g.id, g.slug, g.public_id, g.name, g.double_opt_in, g.redirect, g.archive_public
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
  const archive = typeof body.archive === "boolean" ? body.archive : null; // null = keep

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
    `INSERT INTO groups (slug, name, double_opt_in, redirect, owner_account_id, public_id, archive_public)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, FALSE))
     ON CONFLICT (owner_account_id, slug) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, groups.name),
       double_opt_in = EXCLUDED.double_opt_in,
       redirect = COALESCE(EXCLUDED.redirect, groups.redirect),
       archive_public = COALESCE($7, groups.archive_public)
     RETURNING slug, public_id`,
    [slug, name, doubleOptIn, redirect, accountId, publicId, archive],
  );
  if (!row) return c.json({ ok: false, error: "create failed" }, 500);
  return c.json({
    ok: true,
    slug: row.slug,
    public_id: row.public_id,
    form_url: `${config.baseUrl}/f/${row.public_id}`,
    page_url: `${config.baseUrl}/l/${row.public_id}`,
  });
}

export async function deleteGroupEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const slug = c.req.param("slug");
  const g = await queryOne<{ id: number }>(
    `SELECT id FROM groups WHERE slug = $1 AND owner_account_id = $2`,
    [slug, accountId],
  );
  if (!g) return c.json({ ok: false, error: "group not found" }, 404);

  // Cascade (children first): the list's broadcasts + their tracking/recipients,
  // then its subscribers, then the group itself.
  await query(
    `DELETE FROM tracking_events WHERE broadcast_id IN (SELECT id FROM broadcasts WHERE group_id = $1)`,
    [g.id],
  );
  await query(
    `DELETE FROM broadcast_recipients WHERE broadcast_id IN (SELECT id FROM broadcasts WHERE group_id = $1)`,
    [g.id],
  );
  await query(`DELETE FROM broadcasts WHERE group_id = $1`, [g.id]);
  await query(`DELETE FROM subscribers WHERE group_id = $1`, [g.id]);
  await query(`DELETE FROM groups WHERE id = $1`, [g.id]);
  return c.json({ ok: true, slug });
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

// PUT /v1/groups/:slug/archive { enabled } — show past issues on the hosted page.
export async function setArchiveEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return c.json({ ok: false, error: "enabled: boolean required" }, 400);
  }
  const row = await queryOne<{ public_id: string }>(
    `UPDATE groups SET archive_public = $1
      WHERE owner_account_id = $2 AND (slug = $3 OR public_id = $3)
      RETURNING public_id`,
    [body.enabled, accountId, c.req.param("slug")],
  );
  if (!row) return c.json({ ok: false, error: "list not found" }, 404);
  return c.json({
    ok: true,
    archive: body.enabled,
    page_url: `${config.baseUrl}/l/${row.public_id}`,
  });
}
