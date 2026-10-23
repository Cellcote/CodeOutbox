// `npx codeoutbox`: stack detection + writing the component into the project.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

const run = (cwd: string, ...args: string[]) =>
  promisify(execFile)(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, CO_TOKEN: "" },
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

test("no id and no token → placeholder + signup instructions; refuses to overwrite", async () => {
  const dir = await project({ dependencies: { svelte: "5" } });
  const { stdout } = await run(dir);
  assert.match(await readFile(join(dir, "CodeOutboxForm.svelte"), "utf8"), /YOUR_FORM_ID/);
  assert.match(stdout, /\/signup/);
  await assert.rejects(run(dir), /already exists/);
});
