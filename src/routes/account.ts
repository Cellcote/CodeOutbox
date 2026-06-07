// Authd account endpoints (wrapped by `co brand`).
//   GET   /v1/account → resolved brand (incl. auto-derived defaults) + plan flag
//   PATCH /v1/account → set brand_name / brand_color / brand_logo_url

import type { Context } from "hono";
import { getAccountId } from "../auth";
import { resolveBrand, setBrand, type BrandInput } from "../brand";

const HEX = /^#[0-9a-fA-F]{3,8}$/;

export async function getAccountEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  return c.json({ ok: true, brand: await resolveBrand(accountId) });
}

export async function updateAccountEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const input: BrandInput = {};

  if (body.brand_name !== undefined) {
    input.name = String(body.brand_name).trim().slice(0, 80) || null;
  }
  if (body.brand_color !== undefined) {
    const v = String(body.brand_color).trim();
    if (v && !HEX.test(v)) {
      return c.json(
        { ok: false, error: "brand_color must be a hex color like #2E7D32" },
        400,
      );
    }
    input.color = v || null;
  }
  if (body.brand_logo_url !== undefined) {
    const v = String(body.brand_logo_url).trim();
    if (v && !/^https:\/\//i.test(v)) {
      return c.json(
        { ok: false, error: "brand_logo_url must be an https URL" },
        400,
      );
    }
    input.logoUrl = v || null;
  }

  await setBrand(accountId, input);
  return c.json({ ok: true, brand: await resolveBrand(accountId) });
}
