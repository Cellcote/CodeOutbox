process.env.TOKEN_SECRET = "test-secret";
process.env.DB_DRIVER = "pglite";
process.env.PGLITE_DIR = "/tmp/co-test-queue-" + Date.now();

import { test } from "node:test";
import assert from "node:assert/strict";

const { initDb, query } = await import("../src/db.ts");
const { enqueue, registerJob, startWorker } = await import("../src/queue.ts");

await initDb();

test("queue runs due jobs, delays future ones, and retries failures", async () => {
  let ran = 0;
  registerJob("t.ok", async () => {
    ran++;
  });
  registerJob("t.fail", async () => {
    throw new Error("boom");
  });

  await enqueue("t.ok", { x: 1 });
  await enqueue("t.ok", { x: 2 }, new Date(Date.now() + 60_000)); // future
  await enqueue("t.fail", {});

  startWorker(100);
  await new Promise((r) => setTimeout(r, 1200));

  assert.equal(ran, 1); // only the immediate one ran
  const rows = await query<{ type: string; status: string; attempts: number }>(
    "SELECT type, status, attempts FROM jobs ORDER BY id",
  );
  assert.equal(rows[0].status, "done"); // immediate
  assert.equal(rows[1].status, "pending"); // future, not yet due
  assert.equal(rows[2].status, "pending"); // failed → retry queued
  assert.equal(Number(rows[2].attempts), 1);
});
