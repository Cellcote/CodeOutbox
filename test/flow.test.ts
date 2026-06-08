process.env.TOKEN_SECRET = "test-secret";
process.env.DB_DRIVER = "pglite";
process.env.PGLITE_DIR = "/tmp/co-test-flow-" + Date.now();
process.env.EMAIL_TRANSPORT = "console";

import { test } from "node:test";
import assert from "node:assert/strict";

const { initDb, query, queryOne } = await import("../src/db.ts");
const { sendBroadcast } = await import("../src/broadcast.ts");
const { setWelcome, runWelcomeJob } = await import("../src/welcome.ts");

await initDb();
const acct = await queryOne<{ id: number }>(
  "INSERT INTO accounts (email) VALUES ('t@ex.com') RETURNING id",
);
const accountId = Number(acct!.id);
const grp = await queryOne<{ id: number }>(
  "INSERT INTO groups (slug, public_id, owner_account_id, name) VALUES ('news','pub1',$1,'News') RETURNING id",
  [accountId],
);
const groupId = Number(grp!.id);
await query(
  "INSERT INTO subscribers (group_id, email, status) VALUES ($1,'a@ex.com','confirmed'),($1,'b@ex.com','confirmed'),($1,'c@ex.com','pending')",
  [groupId],
);

const SRC = "---\nsubject: Hi\ngroup: news\n---\nHello world from the test.\n";

test("broadcast sends to confirmed (not pending) subscribers", async () => {
  const r = await sendBroadcast(SRC, accountId);
  assert.equal(r.sent, 2); // a + b, not the pending c
  assert.equal(r.alreadySent, false);
  const n = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM broadcast_recipients WHERE status='sent'",
  );
  assert.equal(Number(n!.n), 2);
});

test("resending identical content is idempotent", async () => {
  const r = await sendBroadcast(SRC, accountId);
  assert.equal(r.alreadySent, true);
});

test("suppressed addresses are skipped", async () => {
  await query(
    "INSERT INTO suppressions (account_id, email, reason) VALUES ($1,'a@ex.com','unsubscribe') ON CONFLICT DO NOTHING",
    [accountId],
  );
  const r = await sendBroadcast(
    "---\nsubject: Second\ngroup: news\n---\nSecond send body.\n",
    accountId,
  );
  assert.equal(r.sent, 1); // only b@ex.com
});

test("welcome email sends once per subscriber (idempotent claim)", async () => {
  await setWelcome(accountId, "news", "Welcome!", "Thanks for joining.");
  const sub = await queryOne<{ id: number }>(
    "SELECT id FROM subscribers WHERE email='b@ex.com'",
  );
  const subId = Number(sub!.id);
  await runWelcomeJob({ subscriberId: subId, groupId });
  const w1 = await queryOne<{ welcomed_at: string | null }>(
    "SELECT welcomed_at FROM subscribers WHERE id=$1",
    [subId],
  );
  assert.ok(w1!.welcomed_at, "welcomed_at is set after the welcome sends");
  // Second run must be a no-op (already welcomed) — and must not throw.
  await runWelcomeJob({ subscriberId: subId, groupId });
  const w2 = await queryOne<{ welcomed_at: string | null }>(
    "SELECT welcomed_at FROM subscribers WHERE id=$1",
    [subId],
  );
  assert.equal(
    String(w2!.welcomed_at),
    String(w1!.welcomed_at),
    "welcomed_at unchanged on re-run",
  );
});
