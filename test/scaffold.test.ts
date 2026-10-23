// `npx codeoutbox`: stack detection + writing the component into the project.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const BIN = resolve("packages/codeoutbox/bin/codeoutbox.mjs");

async function project(pkg: object, files: string[] = []) {
  const dir = await mkdtemp(join(tmpdir(), "co-scaffold-"));
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
  for (const f of files) {
    if (f.endsWith("/")) await mkdir(join(dir, f), { recursive: true });
    else await writeFile(join(dir, f), "");
  }
  return dir;
}

// CO_URL points at a closed port by default so no test ever reaches a real server.
const run = (cwd: string, ...args: string[]) =>
  promisify(execFile)(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, CO_TOKEN: "", CO_URL: process.env.TEST_CO_URL ?? "http://127.0.0.1:9" },
  });

test("Next + Tailwind + TS → client TSX component with Tailwind classes", async () => {
  const dir = await project({ dependencies: { next: "15", react: "19", tailwindcss: "4" } }, ["tsconfig.json", "src/components/"]);
  await run(dir, "--id", "abc123");
  const src = await readFile(join(dir, "src/components/CodeOutboxForm.tsx"), "utf8");
  assert.match(src, /^'use client';/);
  assert.match(src, /\/f\/abc123/);
  assert.match(src, /className="flex/);
});

test("Vite React without Tailwind → JSX + CSS module", async () => {
  const dir = await project({ dependencies: { react: "19" } }, ["src/components/"]);
  await run(dir, "--id", "abc123");
  const src = await readFile(join(dir, "src/components/CodeOutboxForm.jsx"), "utf8");
  assert.match(src, /import s from '.\/CodeOutboxForm.module.css'/);
  assert.match(await readFile(join(dir, "src/components/CodeOutboxForm.module.css"), "utf8"), /\.form \{/);
});

test("--offline → placeholder + signup instructions; refuses to overwrite", async () => {
  const dir = await project({ dependencies: { svelte: "5" } });
  const { stdout } = await run(dir, "--offline");
  assert.match(await readFile(join(dir, "CodeOutboxForm.svelte"), "utf8"), /YOUR_FORM_ID/);
  assert.match(stdout, /\/signup/);
  await assert.rejects(run(dir, "--offline"), /already exists/);
});

test("no id and no token → creates a provisional list and prints the claim link", async () => {
  let got: any;
  const server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c)).on("end", () => {
      got = { url: req.url, body: JSON.parse(b) };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        ok: true, public_id: "prov42", claim_url: "http://x/c/s3cret",
        page_url: "http://x/l/prov42", expires_at: "2026-11-06T00:00:00.000Z",
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.TEST_CO_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const dir = await project({});
    const { stdout } = await run(dir, "--email", "me@ex.com");
    assert.equal(got.url, "/v1/provisional");
    assert.deepEqual(got.body, { slug: "newsletter", email: "me@ex.com" });
    assert.match(await readFile(join(dir, "codeoutbox-form.html"), "utf8"), /\/f\/prov42/);
    assert.match(stdout, /claim:\s+http:\/\/x\/c\/s3cret/);
  } finally {
    delete process.env.TEST_CO_URL;
    server.close();
  }
});

test("server unreachable → falls back to the placeholder", async () => {
  const dir = await project({});
  await run(dir);
  assert.match(await readFile(join(dir, "codeoutbox-form.html"), "utf8"), /YOUR_FORM_ID/);
});
