// Database layer with a pluggable driver:
//   - "pg"     → real PostgreSQL (Docker / production) via node-postgres.
//   - "pglite" → embedded Postgres-in-WASM (local dev, zero external services).
// Both speak the same SQL and the same (sql, params) → { rows } interface, because
// PGlite *is* Postgres — so nothing downstream needs to know which is active.

import { config } from "./config";

interface QueryResult<T> {
  rows: T[];
}
interface Driver {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  // Runs a multi-statement script (DDL). The extended/prepared protocol used by
  // query() only allows one command, so migrations go through exec().
  exec(sql: string): Promise<void>;
}

let driver: Driver | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT,
  double_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  redirect      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id                BIGSERIAL PRIMARY KEY,
  group_id          BIGINT NOT NULL REFERENCES groups(id),
  email             TEXT NOT NULL,
  name              TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','unsubscribed','bounced','complained')),
  consent_ip        TEXT,
  consent_timestamp TIMESTAMPTZ,
  source            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, email)
);
`;

async function makePgDriver(): Promise<Driver> {
  const pg = await import("pg");
  const Pool = (pg as any).default?.Pool ?? (pg as any).Pool;
  const pool = new Pool({ connectionString: config.db.url });

  // Wait for the database to accept connections (compose healthcheck usually
  // covers this, but retry anyway so cold starts don't crash).
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch (err) {
      if (attempt >= 10) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return {
    query: (sql, params) => pool.query(sql, params as any[]),
    exec: async (sql) => {
      await pool.query(sql);
    },
  };
}

async function makePgliteDriver(): Promise<Driver> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(config.db.pgliteDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(config.db.pgliteDir);
  await db.waitReady;
  return {
    query: (sql, params) => db.query(sql, params as any[]) as any,
    exec: async (sql) => {
      await db.exec(sql);
    },
  };
}

export async function initDb(): Promise<void> {
  driver =
    config.db.driver === "pg" ? await makePgDriver() : await makePgliteDriver();
  await driver.exec(SCHEMA);
  await seed();
}

async function seed(): Promise<void> {
  // A ready-to-use group so the demo form works out of the box.
  await query(
    `INSERT INTO groups (slug, name, double_opt_in, redirect)
     VALUES ('newsletter', 'Newsletter', TRUE, '/thanks')
     ON CONFLICT (slug) DO NOTHING`,
  );
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!driver) throw new Error("db not initialised — call initDb() first");
  const res = await driver.query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
