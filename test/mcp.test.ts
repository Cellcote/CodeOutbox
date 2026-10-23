// The hand-rolled MCP server (npx codeoutbox mcp), driven by the official MCP SDK
// client so protocol mistakes fail here, against a mock CodeOutbox API.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const calls: { method: string; url: string; auth?: string; body: any }[] = [];
const api = createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c)).on("end", () => {
    calls.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body: b ? JSON.parse(b) : null });
    const json = (o: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
    if (req.url === "/v1/provisional") return json({ ok: true, public_id: "prov1", claim_url: "http://x/c/s" });
    if (req.url === "/v1/groups") return json({ ok: true, groups: [{ slug: "newsletter", public_id: "pub9", archive_public: false }] });
    if (req.url?.endsWith("/subscribers/import-csv")) return json({ ok: true, added: 2, inactive: 0, columns: ["email"] });
    if (req.url === "/v1/broadcasts/preview") return json({ ok: true, subject: "Hi", recipientCount: 3, warnings: [], html: "<big>", text: "big", previewUrl: "http://x/p/t" });
    res.writeHead(404).end();
  });
});
await new Promise<void>((r) => api.listen(0, r));
const CO_URL = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

async function connect(token: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("packages/codeoutbox/bin/codeoutbox.mjs"), "mcp"],
      env: { ...process.env, CO_URL, CO_TOKEN: token } as Record<string, string>,
      stderr: "ignore",
    }),
  );
  return client;
}

const textOf = (r: any) => r.content[0].text as string;

test("initializes, lists tools and the add-newsletter prompt", async () => {
  const client = await connect("tok");
  try {
    assert.equal(client.getServerVersion()?.name, "codeoutbox");
    assert.match(client.getInstructions() ?? "", /Never send a broadcast without/);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ["create_group", "create_provisional_list", "get_signup_page", "preview_broadcast", "send_broadcast", "send_test"]) {
      assert.ok(names.includes(n), `has ${n}`);
    }
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name), ["add-newsletter"]);
    const p = await client.getPrompt({ name: "add-newsletter" });
    assert.match((p.messages[0].content as any).text, /npx codeoutbox --id/);
  } finally {
    await client.close();
  }
});

test("without a token: account tools explain how to get one; provisional lists still work", async () => {
  const client = await connect("");
  try {
    const denied: any = await client.callTool({ name: "list_groups", arguments: {} });
    assert.equal(denied.isError, true);
    assert.match(textOf(denied), /Settings → API keys/);
    const r: any = await client.callTool({ name: "create_provisional_list", arguments: { email: "me@ex.com" } });
    assert.ok(!r.isError);
    assert.match(textOf(r), /"claim_url"/);
    assert.equal(calls.at(-1)?.auth, undefined, "no Authorization header without a token");
  } finally {
    await client.close();
  }
});

test("with a token: signup page + badge, and previews are shareable but slim", async () => {
  const client = await connect("co_live_x");
  try {
    const page: any = await client.callTool({ name: "get_signup_page", arguments: { group: "newsletter" } });
    const out = JSON.parse(textOf(page));
    assert.equal(out.page_url, `${CO_URL}/l/pub9`);
    assert.match(out.badge_markdown, /badge\/pub9\?style=join\)\]\(.*\/l\/pub9\)/);
    assert.equal(out.add_form_command, "npx codeoutbox --id pub9");

    const pv: any = await client.callTool({ name: "preview_broadcast", arguments: { source: "---\nsubject: Hi\ngroup: newsletter\n---\nHello" } });
    const prev = JSON.parse(textOf(pv));
    assert.equal(prev.previewUrl, "http://x/p/t");
    assert.equal(prev.html, undefined, "full HTML is not dumped into the agent's context");
    assert.equal(calls.find((c) => c.url === "/v1/broadcasts/preview")?.body.share, true);
    assert.equal(calls.at(-1)?.auth, "Bearer co_live_x");

    const file = join(await mkdtemp(join(tmpdir(), "co-mcp-")), "export.csv");
    await writeFile(file, "Email Address\na@ex.com\nb@ex.com\n");
    const imp: any = await client.callTool({ name: "import_subscribers", arguments: { group: "newsletter", path: file, confirmed: true } });
    assert.ok(!imp.isError);
    const sent = calls.find((c) => c.url === "/v1/groups/newsletter/subscribers/import-csv")!;
    assert.equal(sent.body.confirmed, true);
    assert.match(sent.body.csv, /a@ex\.com/);

    const bad: any = await client.callTool({ name: "subscriber_count", arguments: { group: "nope" } });
    assert.equal(bad.isError, true, "API errors surface as tool errors");
  } finally {
    await client.close();
    api.close();
  }
});
