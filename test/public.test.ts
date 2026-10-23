// Zero-signup lists, hosted signup/archive pages and the badge, through the real
// route handlers mounted on a minimal app.
process.env.TOKEN_SECRET = "test-secret";
process.env.DB_DRIVER = "pglite";
process.env.PGLITE_DIR = "/tmp/co-test-public-" + Date.now();
process.env.EMAIL_TRANSPORT = "console";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

const { initDb, query, queryOne } = await import("../src/db.ts");
const { ingest } = await import("../src/routes/ingest.ts");
const { confirm } = await import("../src/routes/confirm.ts");
const { completeClaim } = await import("../src/routes/claim.ts");
const { createProvisionalEndpoint, claimStart } = await import("../src/routes/provisional.ts");
const { listPage, issuePage } = await import("../src/routes/public.ts");
const { badge } = await import("../src/routes/badge.ts");
const { signToken, signClaim } = await import("../src/tokens.ts");
const { sendBroadcast } = await import("../src/broadcast.ts");
const { PROVISIONAL_MAX_SUBSCRIBERS } = await import("../src/provisional.ts");

await initDb();
const app = new Hono();
app.post("/f/:group", ingest);
app.get("/confirm/:token", confirm);
app.get("/claim/:token", completeClaim);
app.post("/v1/provisional", createProvisionalEndpoint);
app.get("/c/:secret", claimStart);
app.get("/l/:id", listPage);
app.get("/l/:id/:issue", issuePage);
app.get("/badge/:ref", badge);

// Capture system emails (console transport prints them).
async function capture(fn: () => Promise<unknown>) {
  const out: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return out.join("\n");
}

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

const subscribe = (id: string, email: string) =>
  app.request(`/f/${id}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ email }).toString(),
  });

let prov: any;

test("provisional list: works with no account, emails a claim link on first confirm", async () => {
  prov = await (await post("/v1/provisional", { slug: "newsletter", email: "dev@ex.com" })).json();
  assert.equal(prov.ok, true);
  assert.match(prov.claim_url, /\/c\//);

  const res = await subscribe(prov.public_id, "reader@ex.com");
  assert.equal(res.status, 200);
  const sub = await queryOne<{ id: number }>(`SELECT id FROM subscribers WHERE email = 'reader@ex.com'`);
  const token = await signToken(sub!.id, "confirm");
  const mail = await capture(() => app.request(`/confirm/${token}`));
  assert.match(mail, /To:\s+dev@ex\.com/);
  assert.match(mail, /Your form works\. r•••@ex\.com just confirmed/);
  assert.doesNotMatch(mail, /reader@ex\.com/, "the owner sees a masked address");
  assert.match(mail, /\/claim\//);

  // the second confirm doesn't nudge again
  await subscribe(prov.public_id, "reader2@ex.com");
  const sub2 = await queryOne<{ id: number }>(`SELECT id FROM subscribers WHERE email = 'reader2@ex.com'`);
  const token2 = await signToken(sub2!.id, "confirm");
  const mail2 = await capture(() => app.request(`/confirm/${token2}`));
  assert.doesNotMatch(mail2, /Your form works/);
});

test("unclaimed lists cap subscribers and stop at expiry", async () => {
  const p = await (await post("/v1/provisional", { slug: "capped" })).json();
  const g = await queryOne<{ id: number }>(`SELECT id FROM groups WHERE public_id = $1`, [p.public_id]);
  for (let i = 0; i < PROVISIONAL_MAX_SUBSCRIBERS; i++) {
    await query(`INSERT INTO subscribers (group_id, email) VALUES ($1, $2)`, [g!.id, `x${i}@ex.com`]);
  }
  assert.equal((await subscribe(p.public_id, "one-too-many@ex.com")).status, 402);
  await query(`UPDATE groups SET expires_at = now() - interval '1 minute' WHERE id = $1`, [g!.id]);
  assert.equal((await subscribe(p.public_id, "x0@ex.com")).status, 410);
  assert.equal((await app.request(`/l/${p.public_id}`)).status, 404);
});

test("claiming binds the list, ends expiry, and dodges a slug collision", async () => {
  const acct = await queryOne<{ id: number }>(`INSERT INTO accounts (email) VALUES ('dev@ex.com') RETURNING id`);
  await query(
    `INSERT INTO groups (slug, public_id, owner_account_id) VALUES ('newsletter', 'own1', $1)`,
    [acct!.id],
  );
  const g = await queryOne<{ id: number }>(`SELECT id FROM groups WHERE public_id = $1`, [prov.public_id]);
  const res = await app.request(`/claim/${await signClaim(g!.id, "dev@ex.com")}`);
  assert.equal(res.status, 303);
  const after = await queryOne<{ owner_account_id: number; slug: string; expires_at: string | null; claim_secret: string | null }>(
    `SELECT owner_account_id, slug, expires_at, claim_secret FROM groups WHERE id = $1`,
    [g!.id],
  );
  assert.equal(Number(after!.owner_account_id), Number(acct!.id));
  assert.match(after!.slug, /^newsletter-[0-9a-f]{4}$/);
  assert.equal(after!.expires_at, null);
  assert.equal(after!.claim_secret, null);
  assert.equal((await app.request(prov.claim_url.replace(/^.*(\/c\/)/, "$1"))).status, 404);
});

test("hosted page: signup form always; past issues only with the archive on", async () => {
  const id = prov.public_id;
  const g = await queryOne<{ id: number; owner_account_id: number; slug: string }>(
    `SELECT id, owner_account_id, slug FROM groups WHERE public_id = $1`,
    [id],
  );
  const accountId = Number(g!.owner_account_id);
  await capture(() =>
    sendBroadcast(`---\nsubject: Issue one for {{first_name | "you"}}\ngroup: ${g!.slug}\n---\nHello {{first_name | "reader"}}, this is the first issue.\n`, accountId),
  );
  await capture(() =>
    sendBroadcast(`---\nsubject: Secret issue\ngroup: ${g!.slug}\narchive: false\n---\nNot for the public archive, thanks.\n`, accountId),
  );

  let html = await (await app.request(`/l/${id}`)).text();
  assert.match(html, new RegExp(`action="[^"]*/f/${id}"`));
  assert.doesNotMatch(html, /Past issues/);

  await query(`UPDATE groups SET archive_public = TRUE WHERE id = $1`, [g!.id]);
  html = await (await app.request(`/l/${id}`)).text();
  assert.match(html, /Issue one for you/);
  assert.doesNotMatch(html, /Secret issue/);

  const issueId = /href="\/l\/[^/]+\/(\d+)"/.exec(html)![1];
  const issue = await (await app.request(`/l/${id}/${issueId}`)).text();
  assert.match(issue, /Hello reader, this is the first issue/);
  assert.doesNotMatch(issue, /reader@ex\.com|\{\{/);
  const secret = await queryOne<{ id: number }>(`SELECT id FROM broadcasts WHERE subject = 'Secret issue'`);
  assert.equal((await app.request(`/l/${id}/${secret!.id}`)).status, 404);
});

test("public pages carry a CSP that only allows the page's own nonce'd script", async () => {
  const res = await app.request(`/l/${prov.public_id}`);
  const csp = res.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  assert.ok(nonce, "script-src uses a nonce");
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*;[^;]*script|script-src[^;]*unsafe/);
  const html = await res.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  assert.ok(scripts.length > 0 && scripts.every((t) => t.includes(`nonce="${nonce}"`)));
});

test("badge resolves by public_id and refuses ambiguous slugs", async () => {
  const svg = await (await app.request(`/badge/${prov.public_id}?style=join`)).text();
  assert.match(svg, /join 2 readers/);
  // two lists named "newsletter" (one per account) → a bare slug is ambiguous
  assert.match(await (await app.request(`/badge/newsletter`)).text(), /unknown/);
});
