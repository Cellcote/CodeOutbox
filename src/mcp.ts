// CodeOutbox MCP server (stdio). Lets any coding agent operate CodeOutbox:
// create lists, check counts, preview and send broadcasts — without a dashboard.
//
// It is a thin client over the control-plane API (same as the `co` CLI):
//   CO_URL   server base (default http://localhost:3000)
//   CO_TOKEN session token used as a Bearer credential
//
// Run: CO_TOKEN=... npm run mcp     (or register with a coding agent — see README)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const base = (process.env.CO_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.CO_TOKEN ?? "";

async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
}

function text(obj: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2),
      },
    ],
  };
}

const server = new McpServer({ name: "codeoutbox", version: "0.0.1" });

server.registerTool(
  "list_groups",
  {
    description: "List the email lists (groups) you own, with subscriber counts.",
    inputSchema: {},
  },
  async () => text(await api("/v1/groups")),
);

server.registerTool(
  "create_group",
  {
    description: "Create (or update) an email list you own.",
    inputSchema: {
      slug: z.string().describe("URL-safe id, e.g. 'newsletter'"),
      name: z.string().optional(),
      doubleOptIn: z.boolean().optional().describe("default true"),
      redirect: z.string().optional().describe("post-submit redirect path/url"),
    },
  },
  async (args) => text(await api("/v1/groups", "POST", args)),
);

server.registerTool(
  "subscriber_count",
  {
    description: "Get confirmed/total subscriber counts for a list.",
    inputSchema: { group: z.string() },
  },
  async ({ group }) =>
    text(await api(`/v1/groups/${encodeURIComponent(group)}/count`)),
);

server.registerTool(
  "preview_broadcast",
  {
    description:
      "Preview a Markdown campaign: recipient count + spam-lint. Sends nothing.",
    inputSchema: {
      source: z
        .string()
        .describe("campaign file contents: frontmatter + Markdown"),
    },
  },
  async ({ source }) =>
    text(await api("/v1/broadcasts/preview", "POST", { source })),
);

server.registerTool(
  "send_broadcast",
  {
    description:
      "Send a Markdown campaign to confirmed subscribers. Set confirm=true to actually " +
      "send; otherwise returns a dry-run preview (recipient count + spam-lint).",
    inputSchema: {
      source: z
        .string()
        .describe("campaign file contents: frontmatter + Markdown"),
      confirm: z.boolean().optional().describe("must be true to actually send"),
    },
  },
  async ({ source, confirm }) =>
    text(await api("/v1/broadcasts", "POST", { source, confirm: confirm === true })),
);

server.registerTool(
  "add_domain",
  {
    description:
      "Add a sending domain and get the SPF/DKIM/DMARC DNS records to publish. " +
      "Required to send broadcasts above the free-tier limit.",
    inputSchema: {
      subdomain: z.string().describe("e.g. 'news.acme.com'"),
    },
  },
  async ({ subdomain }) => text(await api("/v1/domains", "POST", { subdomain })),
);

server.registerTool(
  "verify_domain",
  {
    description:
      "Verify a domain's DNS records (SPF/DKIM/DMARC). When aligned, broadcasts unlock.",
    inputSchema: { subdomain: z.string() },
  },
  async ({ subdomain }) => {
    const list: any = await api("/v1/domains");
    const d = list?.ok && list.domains.find((x: any) => x.subdomain === subdomain);
    if (!d) return text({ ok: false, error: `domain ${subdomain} not found` });
    return text(await api(`/v1/domains/${d.id}/verify`, "POST", {}));
  },
);

server.registerTool(
  "list_domains",
  {
    description: "List sending domains and their verification status.",
    inputSchema: {},
  },
  async () => text(await api("/v1/domains")),
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is reserved for JSON-RPC; log to stderr only.
console.error("codeoutbox MCP server ready");
