// VERP return-path: encode broadcast+subscriber in the envelope sender so a bounce
// coming back identifies exactly who failed. Signed (short HMAC) so a forged bounce
// address can't target an arbitrary subscriber.
//   bounce+<broadcastId>.<subscriberId>.<sig>@<BOUNCE_DOMAIN>

import { createHmac } from "node:crypto";
import { config } from "./config";

function sig(payload: string): string {
  return createHmac("sha256", config.tokenSecret)
    .update(`verp:${payload}`)
    .digest("hex")
    .slice(0, 10);
}

export function verpAddress(broadcastId: number, subscriberId: number): string {
  const p = `${broadcastId}.${subscriberId}`;
  return `bounce+${p}.${sig(p)}@${config.send.bounceDomain}`;
}

export function parseVerp(
  input: string,
): { broadcastId: number; subscriberId: number } | null {
  const local = input.split("@")[0];
  const m = /^bounce\+(\d+)\.(\d+)\.([0-9a-f]{10})$/.exec(local);
  if (!m) return null;
  const [, bid, sid, s] = m;
  if (sig(`${bid}.${sid}`) !== s) return null;
  return { broadcastId: Number(bid), subscriberId: Number(sid) };
}
