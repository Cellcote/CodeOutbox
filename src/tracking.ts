// Open + click tracking. Each recipient's HTML gets a 1x1 open pixel and its links
// rewritten to a signed redirect. Tokens are HMAC-signed (and carry the click URL,
// so the redirect can't be tampered into an open-redirect). Events land in
// tracking_events; broadcastStats() aggregates unique opens/clicks.

import { createHmac } from "node:crypto";
import { config } from "./config";
import { query, queryOne } from "./db";

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sig = (p: string) =>
  createHmac("sha256", config.tokenSecret).update("trk:" + p).digest("base64url").slice(0, 22);

export function signOpen(b: number, s: number): string {
  const p = b64url(JSON.stringify({ t: "o", b, s }));
  return `${p}.${sig(p)}`;
}
export function signClick(b: number, s: number, u: string): string {
  const p = b64url(JSON.stringify({ t: "c", b, s, u }));
  return `${p}.${sig(p)}`;
}
export function verifyTracking(
  token: string,
): { t: string; b: number; s: number; u?: string } | null {
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const p = token.slice(0, i);
  if (sig(p) !== token.slice(i + 1)) return null;
  try {
    return JSON.parse(unb64url(p));
  } catch {
    return null;
  }
}

export async function recordEvent(
  b: number,
  s: number,
  type: "open" | "click",
  url: string | null,
): Promise<void> {
  await query(
    `INSERT INTO tracking_events (broadcast_id, subscriber_id, type, url) VALUES ($1, $2, $3, $4)`,
    [b, s, type, url],
  );
}

// Per-recipient: rewrite http(s) links to the click tracker (skipping the
// unsubscribe link) and append the open pixel.
export function injectTracking(
  html: string,
  b: number,
  s: number,
  skip: Set<string>,
): string {
  const rewritten = html.replace(/href="(https?:\/\/[^"]+)"/g, (m, url) =>
    skip.has(url) ? m : `href="${config.baseUrl}/t/c/${signClick(b, s, url)}"`,
  );
  const pixel = `<img src="${config.baseUrl}/t/o/${signOpen(b, s)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px">`;
  return rewritten + pixel;
}

export interface BcStats {
  opens: number;
  clicks: number;
}
export async function broadcastStats(b: number): Promise<BcStats> {
  const r = await queryOne<{ opens: string; clicks: string }>(
    `SELECT COUNT(DISTINCT subscriber_id) FILTER (WHERE type = 'open')  AS opens,
            COUNT(DISTINCT subscriber_id) FILTER (WHERE type = 'click') AS clicks
       FROM tracking_events WHERE broadcast_id = $1`,
    [b],
  );
  return { opens: Number(r?.opens ?? 0), clicks: Number(r?.clicks ?? 0) };
}
