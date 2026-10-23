// `npx codeoutbox mcp` — the CodeOutbox MCP server (stdio), so a coding agent can set
// up and run a newsletter: create lists, add the form, preview and send campaigns.
// Dependency-free: MCP's stdio transport is newline-delimited JSON-RPC 2.0, and the
// server only needs initialize / tools / prompts.
//
//   claude mcp add codeoutbox -e CO_TOKEN=co_live_… -- npx -y codeoutbox mcp
//
// Env: CO_TOKEN (API key from app.codeoutbox.com → Settings → API keys; optional —
// without it only create_provisional_list works), CO_URL (default the hosted app).

import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";

const base = (process.env.CO_URL || "https://app.codeoutbox.com").replace(/\/$/, "");
const token = process.env.CO_TOKEN || "";
const VERSION = "0.2.0";
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `CodeOutbox runs newsletters for websites: a hosted signup form, double opt-in, and campaigns written in Markdown.
Typical setup: create_group (or create_provisional_list with no account) → put the form on the site (run \`npx codeoutbox --id <public_id>\` in the project; it detects the framework and writes a component) → get_signup_page for a shareable page and README badge → write a campaign → preview_broadcast → send_test → send_broadcast with confirm=true.
Campaign format: YAML frontmatter (subject, group, optional preheader, send_at, draft) followed by Markdown. Merge tags: {{first_name}}, {{name}}, {{email}}, any custom field, with fallbacks like {{first_name | "there"}}.
Never send a broadcast without the user's explicit go-ahead: show them the preview (recipient count and warnings) first.`;

async function api(path, method = "GET", body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

const NO_TOKEN =
  `No CO_TOKEN is set. Create an API key at ${base} (Settings → API keys), then re-add the server:\n` +
  `  claude mcp add codeoutbox -e CO_TOKEN=<key> -- npx -y codeoutbox mcp\n` +
  `Without an account you can still use create_provisional_list.`;

const str = (description) => ({ type: "string", description });
const list = str("the list's slug or public id, e.g. 'newsletter'");
const source = str("the campaign file: YAML frontmatter (subject, group, …) then Markdown");
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const enc = encodeURIComponent;

// name → [description, inputSchema, handler, needsToken = true]
const TOOLS = {
  list_groups: [
    "List the email lists you own, with subscriber counts and public ids.",
    obj({}),
    () => api("/v1/groups"),
  ],
  create_group: [
    "Create (or update) an email list. Returns its public id, form URL and hosted signup page.",
    obj(
      {
        slug: str("URL-safe id, e.g. 'newsletter'"),
        name: str("the name readers see, e.g. 'The Acme newsletter'"),
        doubleOptIn: { type: "boolean", description: "default true" },
        redirect: str("where a no-JS form submit lands (default: a hosted thank-you page)"),
      },
      ["slug"],
    ),
    (a) => api("/v1/groups", "POST", a),
  ],
  create_provisional_list: [
    "Create a working list without an account. Returns a form URL, a hosted signup page and a claim link " +
      "for the user (unclaimed lists hold 25 subscribers and expire after 14 days). Pass the user's email to " +
      "send them the claim link when the first subscriber confirms.",
    obj({ slug: str("default 'newsletter'"), name: str("the name readers see"), email: str("the site owner's email (optional)") }),
    (a) => api("/v1/provisional", "POST", a),
    false,
  ],
  get_signup_page: [
    "Get a list's hosted signup page URL, its form endpoint, and a README badge that links to the page.",
    obj({ group: list }, ["group"]),
    async ({ group }) => {
      const r = await api("/v1/groups");
      const g = r.ok && r.groups.find((x) => x.slug === group || x.public_id === group);
      if (!g) return r.ok ? { ok: false, error: `list "${group}" not found` } : r;
      const page = `${base}/l/${g.public_id}`;
      return {
        ok: true,
        page_url: page,
        form_action: `${base}/f/${g.public_id}`,
        archive: g.archive_public,
        badge_markdown: `[![subscribe](${base}/badge/${g.public_id}?style=join)](${page})`,
        add_form_command: `npx codeoutbox --id ${g.public_id}`,
      };
    },
  ],
  subscriber_count: [
    "Get confirmed and total subscriber counts for a list.",
    obj({ group: list }, ["group"]),
    ({ group }) => api(`/v1/groups/${enc(group)}/count`),
  ],
  add_subscriber: [
    "Add or update a subscriber. `fields` become merge tags ({{company}}). Without confirmed=true they get a " +
      "double-opt-in email; only set confirmed=true when the user already has their consent.",
    obj(
      {
        group: list,
        email: str("subscriber email"),
        name: str("optional"),
        fields: { type: "object", additionalProperties: { type: "string" }, description: 'e.g. { "company": "Acme" }' },
        confirmed: { type: "boolean", description: "true only with existing consent" },
      },
      ["group", "email"],
    ),
    ({ group, ...body }) => api(`/v1/groups/${enc(group)}/subscribers`, "POST", body),
  ],
  import_subscribers: [
    "Import subscribers from a CSV file on this machine, e.g. an export from Mailchimp, Kit, Substack or Buttondown. " +
      "Headers are recognized automatically, unsubscribed/bounced rows are left out, extra columns become merge fields. " +
      "Ask the user whether these people already opted in (confirmed=true, no email) or should get a confirmation email (confirmed=false).",
    obj(
      {
        group: list,
        path: str("path to the CSV file, relative to the project or absolute"),
        confirmed: { type: "boolean", description: "true: they opted in with the old tool; false: send each a confirmation email" },
      },
      ["group", "path", "confirmed"],
    ),
    async ({ group, path, confirmed }) =>
      api(`/v1/groups/${enc(group)}/subscribers/import-csv`, "POST", { csv: await readFile(path, "utf8"), confirmed }),
  ],
  preview_broadcast: [
    "Render a campaign without sending: subject, recipient count, warnings (spam lint, missing merge data, " +
      "plan limits) and a shareable preview link to show the user.",
    obj({ source }, ["source"]),
    ({ source }) => api("/v1/broadcasts/preview", "POST", { source, share: true }).then(({ html, text, ...r }) => r),
  ],
  send_test: [
    "Send the campaign once to the account owner's own inbox, marked [Test].",
    obj({ source }, ["source"]),
    ({ source }) => api("/v1/broadcasts/test", "POST", { source }),
  ],
  send_broadcast: [
    "Send a campaign to every confirmed subscriber of its list. Without confirm=true it only returns a dry run. " +
      "Only set confirm=true after the user has seen the preview and said to send. Re-sending identical content " +
      "never double-sends; `send_at` in the frontmatter schedules it.",
    obj({ source, confirm: { type: "boolean", description: "must be true to actually send" } }, ["source"]),
    ({ source, confirm }) => api("/v1/broadcasts", "POST", { source, confirm: confirm === true }),
  ],
  list_broadcasts: [
    "List recent broadcasts with sent, open and click counts.",
    obj({}),
    () => api("/v1/broadcasts"),
  ],
  set_archive: [
    "Show (or hide) past issues on the list's hosted signup page.",
    obj({ group: list, enabled: { type: "boolean" } }, ["group", "enabled"]),
    ({ group, enabled }) => api(`/v1/groups/${enc(group)}/archive`, "PUT", { enabled }),
  ],
  add_domain: [
    "Add a sending domain and get the SPF/DKIM/DMARC DNS records to publish. Needed to send from the user's own domain.",
    obj({ subdomain: str("e.g. 'news.example.com'") }, ["subdomain"]),
    ({ subdomain }) => api("/v1/domains", "POST", { subdomain }),
  ],
  verify_domain: [
    "Check a sending domain's DNS records. When they line up, mail sends from that domain.",
    obj({ subdomain: str("e.g. 'news.example.com'") }, ["subdomain"]),
    async ({ subdomain }) => {
      const r = await api("/v1/domains");
      const d = r.ok && r.domains.find((x) => x.subdomain === subdomain);
      if (!d) return r.ok ? { ok: false, error: `domain ${subdomain} not found` } : r;
      return api(`/v1/domains/${d.id}/verify`, "POST", {});
    },
  ],
  list_domains: ["List sending domains and their verification status.", obj({}), () => api("/v1/domains")],
};

const PROMPTS = {
  "add-newsletter": {
    description: "Add a newsletter signup to this project and send the first email",
    text:
      "Add a CodeOutbox newsletter to this project.\n" +
      "1. If CodeOutbox tools need a token and none is set, use create_provisional_list (ask me for my email so I get the claim link). Otherwise create_group with a name that fits this site.\n" +
      "2. In the project root, run `npx codeoutbox --id <public_id>` to add the signup form component, then place it where a newsletter signup belongs (footer or a dedicated section) and match the site's styling.\n" +
      "3. Give me the hosted signup page and the README badge (get_signup_page).\n" +
      "4. Draft a short first email in campaigns/hello.md, run preview_broadcast and show me the preview link and warnings. Send nothing until I say so.",
  },
};

// ---- JSON-RPC over stdio ------------------------------------------------------

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

async function handle(req) {
  const { method, params = {} } = req;
  if (method === "initialize") {
    const asked = params.protocolVersion;
    return {
      protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: "codeoutbox", version: VERSION },
      instructions: INSTRUCTIONS,
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") {
    return {
      tools: Object.entries(TOOLS).map(([name, [description, inputSchema]]) => ({ name, description, inputSchema })),
    };
  }
  if (method === "tools/call") {
    const tool = TOOLS[params.name];
    if (!tool) throw Object.assign(new Error(`unknown tool: ${params.name}`), { code: -32602 });
    const [, , run, needsToken = true] = tool;
    if (needsToken && !token) return { content: [{ type: "text", text: NO_TOKEN }], isError: true };
    try {
      const out = await run(params.arguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: out?.ok === false };
    } catch (err) {
      return { content: [{ type: "text", text: `Request to ${base} failed: ${err.message}` }], isError: true };
    }
  }
  if (method === "prompts/list") {
    return { prompts: Object.entries(PROMPTS).map(([name, p]) => ({ name, description: p.description })) };
  }
  if (method === "prompts/get") {
    const p = PROMPTS[params.name];
    if (!p) throw Object.assign(new Error(`unknown prompt: ${params.name}`), { code: -32602 });
    return { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.text } }] };
  }
  throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
}

export function serve() {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: "parse error" } });
    }
    if (req.id === undefined || req.id === null) return; // notification
    try {
      send({ id: req.id, result: await handle(req) });
    } catch (err) {
      send({ id: req.id, error: { code: err.code ?? -32603, message: err.message } });
    }
  });
  // stdout carries JSON-RPC; anything human goes to stderr.
  console.error(`codeoutbox MCP server ${VERSION} · ${base}${token ? "" : " · no CO_TOKEN (provisional lists only)"}`);
}
