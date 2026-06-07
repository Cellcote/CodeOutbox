// Server-rendered HTML: marketing demo form, opt-in result pages, the sign-in
// flow, and the account dashboard. All share one branded shell (the CodeOutbox
// amber [↑] masthead) so the whole surface looks consistent.

import { config } from "./config";
import { escapeHtml } from "./email/shell";

const shell = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${escapeHtml(title)} · CodeOutbox</title>` +
  `<style>` +
  `:root{--ink:#0A0A0A;--amber:#F59E0B;--bg:#f4f4f5;--line:#e7e7e7;--muted:#888}` +
  `*{box-sizing:border-box}` +
  `body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:#111;margin:0;line-height:1.5}` +
  `.bar{background:var(--ink);padding:14px 0}` +
  `.wrap{max-width:720px;margin:0 auto;padding:0 16px}` +
  `.bar .wrap{display:flex;align-items:center;justify-content:space-between}` +
  `.brand{font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-weight:600;font-size:18px;color:#fafafa;letter-spacing:-.5px;text-decoration:none}` +
  `.brand .b{color:var(--amber)}` +
  `.bar a.out{color:#bbb;font-size:13px;text-decoration:none}.bar a.out:hover{color:#fff}` +
  `main{padding:28px 0 56px}` +
  `h1{font-size:24px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 12px}` +
  `.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin:16px 0}` +
  `.row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}` +
  `table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 0;border-bottom:1px solid #f0f0f0;font-size:14px}th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}tr:last-child td{border-bottom:0}` +
  `code{font-family:'JetBrains Mono',Consolas,Menlo,monospace;background:var(--bg);padding:2px 6px;border-radius:5px;font-size:13px}` +
  `input{font:inherit;padding:11px 13px;border-radius:8px;border:1px solid #ccc;width:100%}` +
  `.btn{display:inline-block;background:var(--amber);color:var(--ink);padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;border:0;cursor:pointer;font:inherit}` +
  `.btn:hover{filter:brightness(1.05)}.btn.ghost{background:transparent;border:1px solid #ccc;color:#111}.btn.sm{padding:6px 12px;font-size:13px}` +
  `.pill{display:inline-block;padding:3px 11px;border-radius:999px;font-size:12px;font-weight:600}` +
  `.pill.free{background:#eee;color:#555}.pill.paid{background:var(--ink);color:var(--amber)}.pill.ok{background:#e3f6e8;color:#127c2b}.pill.wait{background:#fff4e0;color:#a86b00}` +
  `.meter{background:#eee;border-radius:6px;height:8px;overflow:hidden;margin-top:6px}.meter>div{background:var(--amber);height:100%}` +
  `.muted{color:var(--muted)}.ok{color:#127c2b}.err{color:#b00020}.sw{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle;border:1px solid #0002}` +
  `a{color:#b97400}` +
  `</style></head><body>` +
  `<header class="bar"><div class="wrap"><a class="brand" href="/dashboard"><span class="b">[&#8593;]</span> CodeOutbox</a></div></header>` +
  `<main><div class="wrap">${body}</div></main></body></html>`;

export const demoFormPage = () =>
  shell(
    "demo form",
    `<h1>CodeOutbox</h1>` +
      `<p class="muted">Walking skeleton: submit → double opt-in → confirm.</p>` +
      `<div class="card"><form action="/f/demo" method="POST" class="row">` +
      `<input type="email" name="email" placeholder="you@example.com" required style="max-width:280px">` +
      `<input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">` +
      `<button class="btn" type="submit">Subscribe</button>` +
      `</form></div>`,
  );

export const thanksPage = () =>
  shell(
    "Thanks",
    `<h1>Almost there ✉️</h1>` +
      `<p>Check your inbox and click the confirmation link to finish subscribing.</p>`,
  );

export const confirmedPage = (email: string) =>
  shell(
    "Confirmed",
    `<h1 class="ok">You're confirmed 🎉</h1>` +
      `<p><strong>${escapeHtml(email)}</strong> is now subscribed.</p>`,
  );

export const confirmErrorPage = () =>
  shell(
    "Link invalid",
    `<h1 class="err">That link didn't work</h1>` +
      `<p class="muted">It may have expired or already been used. Try subscribing again.</p>`,
  );

// Sign-in / sign-up — passwordless. Same form serves both (existing accounts get
// a sign-in link; new emails get an account).
export const signupFormPage = () =>
  shell(
    "Sign in",
    `<h1>Sign in to CodeOutbox</h1>` +
      `<p class="muted">Enter your email and we'll send a magic link. New here? This creates your account — no password, no credit card.</p>` +
      `<div class="card"><form action="/signup" method="POST" class="row">` +
      `<input type="email" name="email" placeholder="you@yourdomain.com" required style="max-width:300px">` +
      `<button class="btn" type="submit">Email me a link</button>` +
      `</form></div>`,
  );

export const signupSentPage = (email: string) =>
  shell(
    "Check your inbox",
    `<h1>Check your inbox 📨</h1>` +
      `<p>We sent a sign-in link to <strong>${escapeHtml(email)}</strong>. Open it to reach your dashboard and API key.</p>`,
  );

export const signupKeyPage = (email: string, apiKey: string) =>
  shell(
    "Your API key",
    `<h1 class="ok">You're in 🎉</h1>` +
      `<p>Signed in as <strong>${escapeHtml(email)}</strong>. Here's your API key — <strong>copy it now, it won't be shown again</strong>:</p>` +
      `<div class="card"><code style="display:block;word-break:break-all">${escapeHtml(apiKey)}</code></div>` +
      `<p><a class="btn" href="/dashboard">Go to dashboard →</a></p>`,
  );

export const unsubscribedPage = () =>
  shell(
    "Unsubscribed",
    `<h1>You're unsubscribed</h1>` +
      `<p class="muted">You won't receive further emails from this list.</p>`,
  );

export const claimSentPage = (email: string) =>
  shell(
    "Claim link sent",
    `<h1>Check your inbox 📨</h1>` +
      `<p>We sent a claim link to <strong>${escapeHtml(email)}</strong>. Open it to take ownership of the list.</p>`,
  );

// Logged out → a sign-in page (not a dead end).
export const notLoggedInPage = () =>
  shell(
    "Sign in",
    `<h1>Sign in to CodeOutbox</h1>` +
      `<p class="muted">You're signed out. Enter your email for a magic link back to your dashboard.</p>` +
      `<div class="card"><form action="/signup" method="POST" class="row">` +
      `<input type="email" name="email" placeholder="you@yourdomain.com" required style="max-width:300px">` +
      `<button class="btn" type="submit">Email me a link</button>` +
      `</form></div>`,
  );

interface GroupRow {
  slug: string;
  public_id: string;
  name: string | null;
  total: number;
  confirmed: number;
}
interface RecentRow {
  email: string;
  status: string;
  slug: string;
}
export interface DashboardData {
  email: string;
  usage: {
    plan: string;
    subscribers: number;
    subscriberLimit: number | null; // null = unlimited
    sends30d: number;
    sendLimit: number | null;
  };
  groups: GroupRow[];
  domains: { subdomain: string; status: string }[];
  brand: { name: string; domain: string; color: string; logoUrl: string };
  recent: RecentRow[];
  billingEnabled: boolean;
}

const fmt = (n: number | null) =>
  n == null || !Number.isFinite(n) ? "∞" : n.toLocaleString();
const meter = (used: number, limit: number | null) => {
  const unlimited = limit == null || !Number.isFinite(limit);
  const pct =
    unlimited || (limit as number) <= 0
      ? 0
      : Math.min(100, Math.round((used / (limit as number)) * 100));
  return (
    `<div class="row"><span class="muted">${fmt(used)} / ${fmt(limit)}</span>` +
    `<span class="muted">${unlimited ? "" : pct + "%"}</span></div>` +
    `<div class="meter"><div style="width:${pct}%"></div></div>`
  );
};

export const dashboardPage = (d: DashboardData) => {
  const paid = d.usage.plan !== "free";
  const planPill = `<span class="pill ${paid ? "paid" : "free"}">${escapeHtml(d.usage.plan)}</span>`;

  const billing = !d.billingEnabled
    ? ""
    : paid
      ? `<a class="btn ghost sm" href="/dashboard/billing">Manage billing</a>`
      : `<div class="row" style="gap:8px">` +
        `<a class="btn sm" href="/dashboard/upgrade?plan=pro">Upgrade · Pro $9</a>` +
        `<a class="btn ghost sm" href="/dashboard/upgrade?plan=growth">Growth $19</a>` +
        `<a class="btn ghost sm" href="/dashboard/upgrade?plan=scale">Scale $49</a>` +
        `</div>`;

  const groupRows = d.groups.length
    ? d.groups
        .map((g) => {
          const url = `${config.baseUrl}/f/${g.public_id}`;
          return (
            `<tr><td><strong>${escapeHtml(g.name ?? g.slug)}</strong><br>` +
            `<span class="muted">${escapeHtml(g.slug)} · <a href="${url}"><code>/f/${escapeHtml(g.public_id)}</code></a></span></td>` +
            `<td style="text-align:right">${g.confirmed}<br><span class="muted">of ${g.total}</span></td></tr>`
          );
        })
        .join("")
    : `<tr><td colspan="2" class="muted">No lists yet — create one with <code>co sync</code> or <code>POST /v1/groups</code>.</td></tr>`;

  const domainRows = d.domains.length
    ? d.domains
        .map(
          (x) =>
            `<tr><td><code>${escapeHtml(x.subdomain)}</code></td>` +
            `<td style="text-align:right"><span class="pill ${x.status === "verified" ? "ok" : "wait"}">${escapeHtml(x.status)}</span></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="muted">No domains yet — send from the shared domain, or <code>co domains add &lt;sub&gt;</code> to brand it.</td></tr>`;

  const recentRows = d.recent.length
    ? d.recent
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.email)}</td><td class="muted">${escapeHtml(r.slug)}</td>` +
            `<td style="text-align:right"><span class="${r.status === "confirmed" ? "ok" : "muted"}">${escapeHtml(r.status)}</span></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No subscribers yet.</td></tr>`;

  return (
    shell(
      "Dashboard",
      `<div class="row"><h1>Dashboard</h1>${planPill}</div>` +
        `<p class="muted">${escapeHtml(d.email)} · <a href="/logout">sign out</a></p>` +
        // usage + billing
        `<div class="card"><div class="row"><h2>Plan &amp; usage</h2>${billing}</div>` +
        `<div style="margin-top:8px"><strong>Subscribers</strong>${meter(d.usage.subscribers, d.usage.subscriberLimit)}</div>` +
        `<div style="margin-top:16px"><strong>Sends (30 days)</strong>${meter(d.usage.sends30d, d.usage.sendLimit)}</div></div>` +
        // lists
        `<div class="card"><h2>Your lists</h2><table><tbody>${groupRows}</tbody></table></div>` +
        // domains
        `<div class="card"><h2>Sending domains</h2><table><tbody>${domainRows}</tbody></table></div>` +
        // brand
        `<div class="card"><div class="row"><h2>Brand</h2><span class="muted">edit with <code>co brand set</code></span></div>` +
        `<table><tbody>` +
        `<tr><td>Name</td><td style="text-align:right">${escapeHtml(d.brand.name)}</td></tr>` +
        `<tr><td>Footer domain</td><td style="text-align:right"><code>${escapeHtml(d.brand.domain)}</code></td></tr>` +
        `<tr><td>Accent</td><td style="text-align:right"><span class="sw" style="background:${/^#[0-9a-fA-F]{3,8}$/.test(d.brand.color) ? d.brand.color : "#F59E0B"}"></span> <code>${escapeHtml(d.brand.color)}</code></td></tr>` +
        `<tr><td>Logo</td><td style="text-align:right">${d.brand.logoUrl ? "set" : '<span class="muted">name shown</span>'}</td></tr>` +
        `</tbody></table></div>` +
        // recent
        `<div class="card"><h2>Recent subscribers</h2><table><tbody>${recentRows}</tbody></table></div>`,
    ) + ""
  );
};

// Small standalone message page (e.g. billing errors), reuses the shell.
export const messagePage = (title: string, html: string) => shell(title, html);
