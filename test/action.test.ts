// GitHub Action: run action/index.mjs as a subprocess against one mock server
// that impersonates both the GitHub REST API and the CodeOutbox API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";

const { globToRegExp, isDraft } = await import("../action/index.mjs");

test("glob matching", () => {
  const re = globToRegExp("campaigns/**/*.md");
  assert.ok(re.test("campaigns/launch.md"));
  assert.ok(re.test("campaigns/2026/oct.md"));
  assert.ok(!re.test("campaigns/notes.txt"));
  assert.ok(!re.test("docs/campaigns/x.md"));
});

test("draft detection reads frontmatter only", () => {
  assert.ok(isDraft("---\nsubject: x\ndraft: true\n---\nbody"));
  assert.ok(!isDraft("---\nsubject: x\n---\ndraft: true"));
});

interface Call {
  method: string;
  url: string;
  body: any;
}

async function readBody(req: IncomingMessage) {
  let s = "";
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : null;
}

async function runAction(event: object, eventName: string, files: Record<string, string>) {
  const calls: Call[] = [];
  const comments: { id: number; body: string }[] = [];
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const url = req.url ?? "";
    calls.push({ method: req.method ?? "", url, body });
    const json = (o: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (url.includes("/pulls/7/files") || url.includes("/compare/")) {
      const list = [
        { filename: "campaigns/oct.md", status: "added" },
        { filename: "campaigns/wip.md", status: "modified" },
        { filename: "campaigns/gone.md", status: "removed" },
        { filename: "src/app.ts", status: "modified" },
      ];
      return json(url.includes("/compare/") ? { files: list } : list);
    }
    if (url.includes("/issues/7/comments") && req.method === "GET") return json(comments);
    if (url.includes("/issues/7/comments") && req.method === "POST") {
      comments.push({ id: 1, body: body.body });
      return json({ id: 1 });
    }
    if (url.startsWith("/v1/broadcasts/preview")) {
      const draft = body.source.includes("draft: true");
      return json({ ok: true, subject: "Oct", group: "news", recipientCount: 3, warnings: [], draft, previewUrl: "https://x/p/abc" });
    }
    if (url === "/v1/broadcasts") {
      return json({ ok: true, broadcastId: 9, alreadySent: false, sent: 3, failed: 0, recipientCount: 3 });
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const dir = await mkdtemp(join(tmpdir(), "co-action-"));
  await mkdir(join(dir, "campaigns"));
  for (const [f, src] of Object.entries(files)) await writeFile(join(dir, f), src);
  await writeFile(join(dir, "event.json"), JSON.stringify(event));

  const out = await promisify(execFile)(process.execPath, [resolve("action/index.mjs")], {
    cwd: dir,
    env: {
      ...process.env,
      CO_TOKEN: "tok",
      CO_URL: base,
      CO_MODE: "auto",
      GH_TOKEN: "gh",
      GITHUB_API_URL: base,
      GITHUB_REPOSITORY: "o/r",
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: join(dir, "event.json"),
      GITHUB_OUTPUT: join(dir, "out.txt"),
    },
  }).catch((e) => e);
  server.close();
  const output = await readFile(join(dir, "out.txt"), "utf8").catch(() => "");
  return { calls, comments, stdout: String(out.stdout), output };
}

const FILES = {
  "campaigns/oct.md": "---\nsubject: Oct\ngroup: news\n---\nHello.\n",
  "campaigns/wip.md": "---\nsubject: WIP\ngroup: news\ndraft: true\n---\nLater.\n",
};

test("pull_request: previews changed campaigns and posts one sticky comment", async () => {
  const { calls, comments } = await runAction({ pull_request: { number: 7 } }, "pull_request", FILES);
  const previews = calls.filter((c) => c.url === "/v1/broadcasts/preview");
  assert.equal(previews.length, 2); // removed + non-campaign files ignored
  assert.ok(previews.every((c) => c.body.share === true));
  assert.ok(!calls.some((c) => c.url === "/v1/broadcasts"), "never sends on a PR");
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /sends to \*\*3\*\* subscribers/);
  assert.match(comments[0].body, /draft — won't send/);
  assert.match(comments[0].body, /\[view email\]\(https:\/\/x\/p\/abc\)/);
});

test("push: sends changed campaigns, skips drafts", async () => {
  const { calls, output } = await runAction({ before: "a".repeat(40), after: "b".repeat(40) }, "push", FILES);
  const sends = calls.filter((c) => c.url === "/v1/broadcasts");
  assert.equal(sends.length, 1);
  assert.equal(sends[0].body.confirm, true);
  assert.match(sends[0].body.source, /subject: Oct/);
  assert.match(output, /"skipped":"draft"/);
});
