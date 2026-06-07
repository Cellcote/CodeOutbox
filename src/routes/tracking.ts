// Open pixel + click redirect endpoints. Best-effort: tracking failures never
// break the user's click or show an error.
//   GET /t/o/:token → 1x1 gif (records an open)
//   GET /t/c/:token → records a click, 302 to the original (signed) URL

import type { Context } from "hono";
import { verifyTracking, recordEvent } from "../tracking";

// 1x1 transparent GIF.
const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function trackOpen(c: Context) {
  const t = verifyTracking(c.req.param("token") ?? "");
  if (t && t.t === "o") {
    try {
      await recordEvent(t.b, t.s, "open", null);
    } catch {
      /* best-effort */
    }
  }
  return c.body(GIF, 200, {
    "content-type": "image/gif",
    "cache-control": "no-store, no-cache, must-revalidate",
  });
}

export async function trackClick(c: Context) {
  const t = verifyTracking(c.req.param("token") ?? "");
  if (!t || t.t !== "c" || !t.u) return c.redirect("/", 302);
  try {
    await recordEvent(t.b, t.s, "click", t.u);
  } catch {
    /* best-effort */
  }
  return c.redirect(t.u, 302);
}
