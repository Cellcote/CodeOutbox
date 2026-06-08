// Tiny per-IP rate limiter for the public, email-sending endpoints (signup, form
// ingest, claim). In-memory is fine for the single-container deploy. Behind NPM,
// the real client IP arrives in X-Forwarded-For.

import type { Context, Next } from "hono";

function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return c.req.header("x-real-ip") || "unknown";
}

interface Entry {
  n: number;
  reset: number;
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const hits = new Map<string, Entry>();
  let lastPrune = Date.now();

  return async (c: Context, next: Next) => {
    const now = Date.now();
    // periodically drop expired entries so the map can't grow unbounded
    if (now - lastPrune > 60_000) {
      for (const [k, e] of hits) if (e.reset < now) hits.delete(k);
      lastPrune = now;
    }

    const ip = clientIp(c);
    let e = hits.get(ip);
    if (!e || e.reset < now) {
      e = { n: 0, reset: now + opts.windowMs };
      hits.set(ip, e);
    }
    e.n++;

    if (e.n > opts.max) {
      c.header("Retry-After", String(Math.ceil((e.reset - now) / 1000)));
      return c.json(
        { ok: false, error: opts.message ?? "Too many requests — please slow down." },
        429,
      );
    }
    await next();
  };
}
