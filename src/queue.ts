// A small, portable, durable job queue backed by the `jobs` table — works on both
// pg and pglite (no external broker, no pg-only dep). An in-process poller claims
// due jobs, runs the registered handler, retries with backoff, and reclaims jobs
// that were left 'active' by a crashed worker.

import { query, queryOne } from "./db";
import { reportError } from "./errors";

type Handler = (payload: any) => Promise<void>;
const handlers = new Map<string, Handler>();

export function registerJob(type: string, fn: Handler): void {
  handlers.set(type, fn);
}

export async function enqueue(
  type: string,
  payload: unknown,
  runAt?: Date,
): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO jobs (type, payload, run_at)
     VALUES ($1, $2, COALESCE($3::timestamptz, now())) RETURNING id`,
    [type, JSON.stringify(payload ?? {}), runAt ? runAt.toISOString() : null],
  );
  return Number(row!.id);
}

interface Job {
  id: number;
  type: string;
  payload: string;
  attempts: number;
  max_attempts: number;
}

async function claimNext(): Promise<Job | null> {
  // Atomically claim one due job. FOR UPDATE SKIP LOCKED makes this safe under
  // concurrency on pg; pglite is single-connection so it's trivially safe.
  return queryOne<Job>(
    `UPDATE jobs SET status='active', updated_at=now()
       WHERE id = (
         SELECT id FROM jobs
          WHERE status='pending' AND run_at <= now()
          ORDER BY id LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
     RETURNING id, type, payload, attempts, max_attempts`,
  );
}

async function fail(job: Job, msg: string): Promise<void> {
  const next = job.attempts + 1;
  if (next >= job.max_attempts) {
    await query(
      `UPDATE jobs SET status='failed', attempts=$2, last_error=$3, updated_at=now() WHERE id=$1`,
      [job.id, next, msg.slice(0, 500)],
    );
  } else {
    const backoff = Math.min(300, 2 ** next * 5); // 10, 20, 40, 80, 160, 300s
    await query(
      `UPDATE jobs SET status='pending', attempts=$2, last_error=$3,
              run_at = now() + interval '1 second' * $4, updated_at=now()
        WHERE id=$1`,
      [job.id, next, msg.slice(0, 500), backoff],
    );
  }
}

let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // Reclaim jobs a crashed worker left 'active'. Handlers must be idempotent.
    await query(
      `UPDATE jobs SET status='pending', updated_at=now()
        WHERE status='active' AND updated_at < now() - interval '10 minutes'`,
    );
    for (let i = 0; i < 10; i++) {
      const job = await claimNext();
      if (!job) break;
      const fn = handlers.get(job.type);
      if (!fn) {
        await fail(job, `no handler registered for "${job.type}"`);
        continue;
      }
      try {
        await fn(JSON.parse(job.payload));
        await query(`UPDATE jobs SET status='done', updated_at=now() WHERE id=$1`, [
          job.id,
        ]);
      } catch (e) {
        reportError(`job ${job.type}#${job.id}`, e);
        await fail(job, String((e as Error)?.message ?? e));
      }
    }
  } finally {
    ticking = false;
  }
}

export function startWorker(intervalMs = 2000): NodeJS.Timeout {
  const t = setInterval(() => {
    tick().catch((e) => reportError("queue tick", e));
  }, intervalMs);
  // Don't keep the process alive on its own (the HTTP server does that in prod;
  // lets tests exit cleanly).
  t.unref?.();
  return t;
}
