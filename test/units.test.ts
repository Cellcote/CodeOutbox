process.env.TOKEN_SECRET = "test-secret";
process.env.DB_DRIVER = "pglite";
process.env.PGLITE_DIR = "/tmp/co-test-units-" + Date.now();

import { test } from "node:test";
import assert from "node:assert/strict";

// Set env before importing config-dependent modules.
const { getPlan } = await import("../src/plans.ts");
const { verpAddress, parseVerp } = await import("../src/verp.ts");
const { signClick, verifyTracking } = await import("../src/tracking.ts");
const { parseDelay, interpolate } = await import("../src/automations.ts");

test("getPlan falls back to free; known plans resolve", () => {
  assert.equal(getPlan("nope").name, "free");
  assert.equal(getPlan(null).name, "free");
  assert.equal(getPlan("pro").subscribers, 3000);
  assert.equal(getPlan("max").subscribers, 500000);
});

test("VERP signs, round-trips, and rejects a bad signature", () => {
  const v = verpAddress(12, 34);
  const p = parseVerp(v);
  assert.equal(p?.broadcastId, 12);
  assert.equal(p?.subscriberId, 34);
  assert.equal(parseVerp("bounce+12.34.0000000000@bounce.codeoutbox.com"), null);
  assert.equal(parseVerp("not-a-verp"), null);
});

test("tracking tokens verify the URL and reject tampering", () => {
  const t = signClick(1, 2, "https://example.com/x");
  assert.equal(verifyTracking(t)?.u, "https://example.com/x");
  assert.equal(verifyTracking(t.slice(0, -1) + "Z"), null);
});

test("parseDelay handles d/h/m and bare minutes", () => {
  assert.equal(parseDelay("3d"), 4320);
  assert.equal(parseDelay("12h"), 720);
  assert.equal(parseDelay("30m"), 30);
  assert.equal(parseDelay("45"), 45);
  assert.equal(parseDelay("nonsense"), 0);
});

test("interpolate substitutes {{vars}} from data", () => {
  assert.equal(
    interpolate("Hi {{name}}, code {{code}}", { name: "Bo", code: "X1" }),
    "Hi Bo, code X1",
  );
  assert.equal(interpolate("Hi {{missing}}!", {}), "Hi !");
});
