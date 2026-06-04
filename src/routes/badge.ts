// GET /badge/:slug — a shields-style SVG badge of confirmed subscribers. Public,
// cacheable, embeddable in a README. The growth loop: every embed is social proof
// + a backlink.

import type { Context } from "hono";
import { queryOne } from "../db";

// Rough text width at 11px Verdana (good enough for a badge).
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[iIl1.,:]/.test(ch) ? 3.2 : /[mwMW]/.test(ch) ? 9 : 6.4;
  return Math.ceil(w);
}

function renderBadge(label: string, message: string, color: string): string {
  const pad = 10;
  const lw = textWidth(label) + pad * 2;
  const mw = textWidth(message) + pad * 2;
  const w = lw + mw;
  const lx = lw / 2;
  const mx = lw + mw / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${message}">` +
    `<title>${label}: ${message}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${lw}" height="20" fill="#555"/>` +
    `<rect x="${lw}" width="${mw}" height="20" fill="${color}"/>` +
    `<rect width="${w}" height="20" fill="url(#s)"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${lx}" y="15" fill="#010101" fill-opacity=".3">${label}</text>` +
    `<text x="${lx}" y="14">${label}</text>` +
    `<text x="${mx}" y="15" fill="#010101" fill-opacity=".3">${message}</text>` +
    `<text x="${mx}" y="14">${message}</text>` +
    `</g></svg>`
  );
}

const HEX = /^[0-9a-fA-F]{3,8}$/;

export async function badge(c: Context) {
  const slug = c.req.param("slug");
  const label = (c.req.query("label") || "subscribers").slice(0, 40);
  const colorRaw = c.req.query("color") || "F59E0B"; // brand amber
  const color = HEX.test(colorRaw) ? `#${colorRaw}` : "#F59E0B";

  const row = await queryOne<{ confirmed: number }>(
    `SELECT COUNT(s.id) FILTER (WHERE s.status = 'confirmed')::int AS confirmed
       FROM groups g LEFT JOIN subscribers s ON s.group_id = g.id
      WHERE g.slug = $1
      GROUP BY g.id`,
    [slug],
  );

  const message = row ? row.confirmed.toLocaleString("en-US") : "unknown";
  const svg = renderBadge(label, message, row ? color : "#9f9f9f");

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=300, s-maxage=300");
  return c.body(svg);
}
