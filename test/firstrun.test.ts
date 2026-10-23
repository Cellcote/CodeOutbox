// First run: sign-up → welcome, the reader's branded opt-in path, and the
// dashboard checklist state.
process.env.TOKEN_SECRET = "test-secret";
process.env.DB_DRIVER = "pglite";
process.env.PGLITE_DIR = "/tmp/co-test-firstrun-" + Date.now();
process.env.EMAIL_TRANSPORT = "console";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

const { initDb, query, queryOne } = await import("../src/db.ts");
const { completeSignup } = await import("../src/routes/signup.ts");
const { ingest } = await import("../src/routes/ingest.ts");
const { confirm } = await import("../src/routes/confirm.ts");
const { thanksPageRoute } = await import("../src/routes/public.ts");
const { signLogin, signToken } = await import("../src/tokens.ts");
const { onboardingState } = await import("../src/onboarding.ts");
const { sendBroadcast } = await import("../src/broadcast.ts");

await initDb();
const app = new Hono();
app.get("/signup/:token", completeSignup);
app.post("/f/:group", ingest);
app.get("/confirm/:token", confirm);
app.get("/thanks", thanksPageRoute);

async function capture(fn: () => Promise<unknown>) {
  const out: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
  try {
    const r = await fn();
    return { r, out: out.join("\n") };
  } finally {
    console.log = orig;
  }
}

test("first sign-in shows the welcome page without minting a key; later sign-ins go to the dashboard", async () => {
  const first = await app.request(`/signup/${await signLogin("maker@ex.com")}`);
  assert.equal(first.status, 200);
  assert.match(await first.text(), /Welcome aboard/);
  const keys = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM api_tokens`);
  assert.equal(Number(keys!.n), 0, "no API key per sign-in");

  const again = await app.request(`/signup/${await signLogin("maker@ex.com")}`);
  assert.equal(again.status, 303);
  assert.equal(again.headers.get("location"), "/dashboard");
});

let accountId = 0;
let publicId = "";

test("a reader's opt-in email and pages carry the list's name", async () => {
  accountId = Number((await queryOne<{ id: number }>(`SELECT id FROM accounts WHERE email = 'maker@ex.com'`))!.id);
  await query(`UPDATE accounts SET brand_name = 'Your Website', brand_color = '#2E7D32' WHERE id = $1`, [accountId]);
  publicId = "hv1";
  await query(
    `INSERT INTO groups (slug, name, public_id, owner_account_id) VALUES ('notes', 'Your Website Weekly', $1, $2)`,
    [publicId, accountId],
  );

  const { r, out } = await capture(() =>
    app.request(`/f/${publicId}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=jane%40gmail.com",
    }),
  );
  const res = r as Response;
  assert.equal(res.status, 303);
  const loc = res.headers.get("location")!;
  assert.equal(loc, `/thanks?l=${publicId}&e=${encodeURIComponent("j•••@gmail.com")}`);
  assert.match(out, /From:\s+"Your Website Weekly" </);
  assert.match(out, /Subject: Confirm your subscription to Your Website Weekly/);

  const thanks = await (await app.request(loc)).text();
  assert.match(thanks, /Check your inbox/);
  assert.match(thanks, /j•••@gmail\.com/);
  assert.match(thanks, /Your Website Weekly/);
  // a forged e= that isn't a masked address is not echoed
  assert.doesNotMatch(await (await app.request(`/thanks?l=${publicId}&e=Call%20us%20now`)).text(), /Call us now/);

  const sub = await queryOne<{ id: number }>(`SELECT id FROM subscribers WHERE email = 'jane@gmail.com'`);
  const done = await (await app.request(`/confirm/${await signToken(sub!.id, "confirm")}`)).text();
  assert.match(done, /You're subscribed/);
  assert.match(done, /Your Website Weekly/);
  assert.doesNotMatch(done, /\[↑\]/, "no CodeOutbox masthead on the reader's page");
});

test("checklist state advances: list → form works → self confirmed → sent", async () => {
  let s = await onboardingState(accountId);
  assert.deepEqual([!!s.list, s.formWorks, s.selfConfirmed, s.sent], [true, true, false, false]);
  assert.equal(s.firstReader, "j•••@gmail.com");

  const g = await queryOne<{ id: number }>(`SELECT id FROM groups WHERE public_id = $1`, [publicId]);
  await query(`INSERT INTO subscribers (group_id, email, status) VALUES ($1, 'maker@ex.com', 'confirmed')`, [g!.id]);
  await capture(() => sendBroadcast("---\nsubject: Hello\ngroup: notes\n---\nHello from the first email body.\n", accountId));
  s = await onboardingState(accountId);
  assert.equal(s.done, 4);
});
