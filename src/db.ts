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
CREATE TABLE IF NOT EXISTS accounts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

CREATE TABLE IF NOT EXISTS api_tokens (
  id           BIGSERIAL PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES accounts(id),
  name         TEXT,
  hash         TEXT UNIQUE NOT NULL,
  scopes       TEXT NOT NULL DEFAULT 'full',
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id                  BIGSERIAL PRIMARY KEY,
  slug                TEXT NOT NULL,
  public_id           TEXT,
  name                TEXT,
  double_opt_in       BOOLEAN NOT NULL DEFAULT TRUE,
  redirect            TEXT,
  owner_account_id    BIGINT REFERENCES accounts(id),
  pending_owner_email TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent upgrades for databases created by the M1 skeleton.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS owner_account_id BIGINT REFERENCES accounts(id);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS pending_owner_email TEXT;

-- Phase 1 multi-tenant: per-account slug namespace + unguessable public form id.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_slug_key;
UPDATE groups SET public_id = 'demo' WHERE slug = 'newsletter' AND public_id IS NULL;
UPDATE groups SET public_id = substr(md5(random()::text || id::text), 1, 12) WHERE public_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS groups_public_id_idx ON groups (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS groups_owner_slug_idx ON groups (owner_account_id, slug);

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

CREATE TABLE IF NOT EXISTS suppressions (
  id         BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id),
  email      TEXT NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, email)
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id               BIGSERIAL PRIMARY KEY,
  account_id       BIGINT NOT NULL REFERENCES accounts(id),
  group_id         BIGINT NOT NULL REFERENCES groups(id),
  subject          TEXT NOT NULL,
  content_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','sending','sent','failed')),
  send_at          TIMESTAMPTZ,
  sent_count       INT NOT NULL DEFAULT 0,
  bounced_count    INT NOT NULL DEFAULT 0,
  complained_count INT NOT NULL DEFAULT 0,
  skipped_count    INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id            BIGSERIAL PRIMARY KEY,
  broadcast_id  BIGINT NOT NULL REFERENCES broadcasts(id),
  subscriber_id BIGINT NOT NULL REFERENCES subscribers(id),
  status        TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','failed','skipped')),
  provider_id   TEXT,
  error         TEXT,
  UNIQUE (broadcast_id, subscriber_id)
);

CREATE TABLE IF NOT EXISTS domains (
  id               BIGSERIAL PRIMARY KEY,
  account_id       BIGINT NOT NULL REFERENCES accounts(id),
  subdomain        TEXT UNIQUE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','verified','failed')),
  dkim_selector    TEXT NOT NULL,
  dkim_public_key  TEXT NOT NULL,
  dkim_private_key TEXT,
  records          TEXT NOT NULL,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE domains ADD COLUMN IF NOT EXISTS dkim_private_key TEXT;
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
  // A ready-to-use demo group (stable public id "demo") so the demo form works.
  await query(
    `INSERT INTO groups (slug, public_id, name, double_opt_in, redirect)
     VALUES ('newsletter', 'demo', 'Newsletter', TRUE, '/thanks')
     ON CONFLICT (public_id) DO NOTHING`,
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
