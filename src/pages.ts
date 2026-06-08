// Server-rendered HTML: marketing demo form, opt-in result pages, the sign-in
// flow, and the account dashboard. All share one branded shell (the CodeOutbox
// amber [↑] masthead) so the whole surface looks consistent.

import { config } from "./config";
import { escapeHtml, escapeAttr } from "./email/shell";

// GA4 tag, only when configured (self-hosters set their own / none).
const gaTag = config.analytics.gaId
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${config.analytics.gaId}"></script>` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});gtag('js',new Date());gtag('config','${config.analytics.gaId}');</script>`
  : "";

const shell = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  gaTag +
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
  `<main><div class="wrap">${body}</div></main>` +
  `<footer style="border-top:1px solid var(--line);padding:18px 0;margin-top:8px"><div class="wrap" style="font-size:12px;color:var(--muted)">` +
  `<a href="https://codeoutbox.com/privacy.html" style="color:var(--muted)">Privacy</a> · ` +
  `<a href="https://codeoutbox.com/terms.html" style="color:var(--muted)">Terms</a> · ` +
  `<a href="https://codeoutbox.com" style="color:var(--muted)">codeoutbox.com</a></div></footer>` +
  `</body></html>`;

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
      `</form></div>` +
      `<p class="muted" style="font-size:13px">By continuing you agree to our <a href="https://codeoutbox.com/terms.html">Terms</a> and <a href="https://codeoutbox.com/privacy.html">Privacy Policy</a>.</p>`,
  );

export const signupSentPage = (email: string) =>
  shell(
    "Check your inbox",
    `<h1>Check your inbox 📨</h1>` +
      `<p>We sent a sign-in link to <strong>${escapeHtml(email)}</strong>. Open it to reach your dashboard and API key.</p>` +
      `<script>window.gtag&&gtag('event','generate_lead',{method:'magic_link'})</script>`,
  );

export const signupKeyPage = (email: string, apiKey: string) =>
  shell(
    "Your API key",
    `<h1 class="ok">You're in 🎉</h1>` +
      `<p>Signed in as <strong>${escapeHtml(email)}</strong>. Here's your API key — <strong>copy it now, it won't be shown again</strong>:</p>` +
      `<div class="card"><code style="display:block;word-break:break-all">${escapeHtml(apiKey)}</code></div>` +
      `<p><a class="btn" href="/dashboard">Go to dashboard →</a></p>` +
      `<script>window.gtag&&gtag('event','sign_up',{method:'magic_link'})</script>`,
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
      `</form></div>` +
      `<p class="muted" style="font-size:13px">By continuing you agree to our <a href="https://codeoutbox.com/terms.html">Terms</a> and <a href="https://codeoutbox.com/privacy.html">Privacy Policy</a>.</p>`,
  );

interface GroupRow {
  slug: string;
  public_id: string;
  name: string | null;
  total: number;
  confirmed: number;
  has_welcome?: boolean;
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
  broadcasts: { id: number; subject: string; status: string; sent: number; opens: number; clicks: number }[];
  domains: { id: number; subdomain: string; status: string }[];
  tokens: { id: number; name: string; created_at: string; last_used_at: string | null }[];
  brand: { name: string; domain: string; color: string; logoUrl: string };
  webhooks: { id: number; url: string; events: string }[];
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
        `<a class="btn sm" href="/dashboard/upgrade?plan=pro">Upgrade · Pro $9/mo</a>` +
        `<a class="btn ghost sm" href="/dashboard/upgrade?plan=growth">Growth $19</a>` +
        `<a class="btn ghost sm" href="/dashboard/upgrade?plan=scale">Scale $49</a>` +
        `</div>`;
  const annualNote =
    !d.billingEnabled || paid
      ? ""
      : `<p class="muted" style="margin:14px 0 0;font-size:13px">Annual billing — <b>2 months free</b>: ` +
        `<a href="/dashboard/upgrade?plan=pro&interval=year">Pro $90/yr</a> · ` +
        `<a href="/dashboard/upgrade?plan=growth&interval=year">Growth $190/yr</a> · ` +
        `<a href="/dashboard/upgrade?plan=scale&interval=year">Scale $490/yr</a></p>`;

  const embed = (g: GroupRow) =>
    `<form action="${config.baseUrl}/f/${g.public_id}" method="POST">\n` +
    `  <input type="email" name="email" required placeholder="you@example.com">\n` +
    `  <button type="submit">Subscribe</button>\n</form>`;
  const groupRows = d.groups.length
    ? d.groups
        .map(
          (g) =>
            `<tr><td><strong>${escapeHtml(g.name ?? g.slug)}</strong>${g.has_welcome ? ` <span class="pill ok" style="font-size:11px">✉ welcome</span>` : ""}<br>` +
            `<span class="muted">${escapeHtml(g.slug)} · <a href="${config.baseUrl}/f/${escapeHtml(g.public_id)}"><code>/f/${escapeHtml(g.public_id)}</code></a></span></td>` +
            `<td style="text-align:right">${g.confirmed}<br><span class="muted">of ${g.total}</span></td>` +
            `<td style="text-align:right"><button class="btn ghost sm copy-embed" data-snippet="${escapeAttr(embed(g))}">Copy embed</button> ` +
            `<button class="btn ghost sm list-del" data-slug="${escapeAttr(g.slug)}" data-name="${escapeAttr(g.name ?? g.slug)}" data-count="${g.total}" style="border-color:#e0b4b4;color:#b00020">Delete</button></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No lists yet — create your first one below.</td></tr>`;

  const domainRows = d.domains.length
    ? d.domains
        .map(
          (x) =>
            `<tr><td><code>${escapeHtml(x.subdomain)}</code></td>` +
            `<td style="text-align:right"><span class="pill ${x.status === "verified" ? "ok" : "wait"}">${escapeHtml(x.status)}</span></td>` +
            `<td style="text-align:right">${
              x.status === "verified"
                ? ""
                : `<button class="btn ghost sm dns-show" data-id="${x.id}">Records</button> <button class="btn sm dns-verify" data-id="${x.id}">Verify</button>`
            }</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No domains yet — add yours below to brand your sending.</td></tr>`;

  const recentRows = d.recent.length
    ? d.recent
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.email)}</td><td class="muted">${escapeHtml(r.slug)}</td>` +
            `<td style="text-align:right"><span class="${r.status === "confirmed" ? "ok" : "muted"}">${escapeHtml(r.status)}</span></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No subscribers yet.</td></tr>`;

  const d8 = (s: string) => escapeHtml(new Date(s).toLocaleDateString());
  const tokenRows = d.tokens.length
    ? d.tokens
        .map(
          (t) =>
            `<tr><td><strong>${escapeHtml(t.name)}</strong><br><span class="muted">created ${d8(t.created_at)}${t.last_used_at ? ` · last used ${d8(t.last_used_at)}` : " · never used"}</span></td>` +
            `<td style="text-align:right"><button class="btn ghost sm key-revoke" data-id="${t.id}">Revoke</button></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="muted">No API keys yet.</td></tr>`;

  const groupOptions = d.groups
    .map((g) => `<option value="${escapeAttr(g.slug)}">${escapeHtml(g.name ?? g.slug)}</option>`)
    .join("");
  const TA =
    "font-family:monospace;font-size:13px;padding:10px;border:1px solid #e7e7e7;border-radius:8px;width:100%;box-sizing:border-box";
  const AF = "display:flex;flex-direction:column;gap:8px;max-width:560px";
  const noLists = `<div class="card"><p class="muted" style="margin:0">Create a list first (Lists tab) to set up automations.</p></div>`;

  // ---- Overview ----
  const usageCard =
    `<div class="card"><div class="row"><h2>Plan &amp; usage</h2>${billing}</div>` +
    `<div style="margin-top:8px"><strong>Subscribers</strong>${meter(d.usage.subscribers, d.usage.subscriberLimit)}</div>` +
    `<div style="margin-top:16px"><strong>Sends (30 days)</strong>${meter(d.usage.sends30d, d.usage.sendLimit)}</div>${annualNote}</div>`;
  const recentCard = `<div class="card"><h2>Recent subscribers</h2><table><tbody>${recentRows}</tbody></table></div>`;

  // ---- Lists ----
  const firstRun =
    d.groups.length === 0
      ? `<div class="card" style="background:#fff8ec;border-color:#f5d99a"><h2 style="color:#a86b00;margin-bottom:8px">👋 Welcome — let's get you sending</h2>` +
        `<p style="margin:0">Create your first list below, drop its <em>Copy embed</em> form on your site, then <code>co send your-post.md --live</code>. <a href="https://codeoutbox.com/docs.html">Read the quickstart →</a></p></div>`
      : "";
  const listsCard =
    `<div class="card"><h2>Your lists</h2><table><tbody>${groupRows}</tbody></table>` +
    `<form id="co-new-list" class="row" style="margin-top:14px;gap:8px;justify-content:flex-start">` +
    `<input name="slug" placeholder="list-slug" required pattern="[a-z0-9-]+" style="max-width:170px">` +
    `<input name="name" placeholder="Display name" style="max-width:190px">` +
    `<button class="btn sm" type="submit">+ Create list</button>` +
    `<span class="co-msg muted" style="font-size:13px;align-self:center"></span></form></div>`;

  // ---- Broadcasts ----
  const broadcastsCard =
    `<div class="card"><h2>Broadcasts</h2><table><thead><tr><th>Subject</th><th style="text-align:right">Sent</th><th style="text-align:right">Opens</th><th style="text-align:right">Clicks</th></tr></thead><tbody>${
      d.broadcasts.length
        ? d.broadcasts
            .map((b) => {
              const rate = (n: number) =>
                b.sent > 0 ? Math.round((n / b.sent) * 100) + "%" : "—";
              return (
                `<tr><td>${b.status !== "sent" ? `<span class="pill wait" style="margin-right:6px">${escapeHtml(b.status)}</span>` : ""}<a href="/dashboard/broadcasts/${b.id}">${escapeHtml(b.subject)}</a></td>` +
                `<td style="text-align:right">${b.sent}</td>` +
                `<td style="text-align:right">${b.opens} <span class="muted">${rate(b.opens)}</span></td>` +
                `<td style="text-align:right">${b.clicks} <span class="muted">${rate(b.clicks)}</span></td></tr>`
              );
            })
            .join("")
        : `<tr><td colspan="4" class="muted">No broadcasts sent yet.</td></tr>`
    }</tbody></table></div>`;

  // ---- Automations ----
  const welcomeCard =
    `<div class="card"><h2>Welcome email</h2>` +
    `<p class="muted" style="margin-top:0">Sent the moment someone confirms — a greeting, a discount code, whatever you like.</p>` +
    `<form id="co-welcome" style="${AF}">` +
    `<select id="wl-list" style="max-width:260px">${d.groups.map((g) => `<option value="${escapeAttr(g.slug)}">${escapeHtml(g.name ?? g.slug)}${g.has_welcome ? " ✓" : ""}</option>`).join("")}</select>` +
    `<input id="wl-subject" placeholder="Subject — e.g. Welcome! Here's 10% off">` +
    `<textarea id="wl-body" rows="5" placeholder="Markdown — Hi, thanks for signing up! Use code WELCOME10." style="${TA}"></textarea>` +
    `<div class="row" style="gap:8px;justify-content:flex-start"><button class="btn sm" type="submit">Save welcome</button><button id="wl-off" type="button" class="btn ghost sm">Turn off</button><span class="co-msg muted" style="font-size:13px;align-self:center"></span></div>` +
    `</form></div>`;
  const sequenceCard =
    `<div class="card"><h2>Sequence (drip)</h2>` +
    `<p class="muted" style="margin-top:0">Timed follow-up letters after confirm — e.g. a tip on day 3, an offer on day 7.</p>` +
    `<select id="sq-list" style="max-width:260px">${groupOptions}</select>` +
    `<div id="sq-steps" style="margin:12px 0"></div>` +
    `<form id="sq-add" style="${AF}">` +
    `<input id="sq-delay" placeholder="Delay after signup — e.g. 3d, 12h, 30m" style="max-width:260px">` +
    `<input id="sq-subject" placeholder="Subject">` +
    `<textarea id="sq-body" rows="4" placeholder="Markdown body" style="${TA}"></textarea>` +
    `<div class="row" style="gap:8px;justify-content:flex-start"><button class="btn sm" type="submit">+ Add step</button><span class="co-msg muted" style="font-size:13px;align-self:center"></span></div>` +
    `</form></div>`;
  const winbackCard =
    `<div class="card"><h2>Win-back</h2>` +
    `<p class="muted" style="margin-top:0">Re-engage subscribers who received broadcasts but haven't opened or clicked in a while.</p>` +
    `<form id="co-winback" style="${AF}">` +
    `<select id="wb-list" style="max-width:260px">${groupOptions}</select>` +
    `<input id="wb-days" type="number" min="1" placeholder="Inactive days (default 60)" style="max-width:220px">` +
    `<input id="wb-subject" placeholder="Subject — e.g. Still want these? 👀">` +
    `<textarea id="wb-body" rows="4" placeholder="Markdown — We haven't seen you in a while…" style="${TA}"></textarea>` +
    `<div class="row" style="gap:8px;justify-content:flex-start"><button class="btn sm" type="submit">Save win-back</button><button id="wb-off" type="button" class="btn ghost sm">Turn off</button><span class="co-msg muted" style="font-size:13px;align-self:center"></span></div>` +
    `</form></div>`;
  const rssCard =
    `<div class="card"><h2>RSS → email</h2>` +
    `<p class="muted" style="margin-top:0">New posts in a feed are auto-sent to this list as broadcasts (checked every ~30 min).</p>` +
    `<form id="co-rss" style="${AF}">` +
    `<select id="rs-list" style="max-width:260px">${groupOptions}</select>` +
    `<input id="rs-url" placeholder="https://yourblog.com/feed.xml" style="max-width:420px">` +
    `<div class="row" style="gap:8px;justify-content:flex-start"><button class="btn sm" type="submit">Save feed</button><button id="rs-off" type="button" class="btn ghost sm">Turn off</button><span class="co-msg muted" style="font-size:13px;align-self:center"></span></div>` +
    `</form></div>`;
  const triggersCard =
    `<div class="card"><h2>API triggers</h2>` +
    `<p class="muted" style="margin-top:0">Fire an email from your app: <code>POST /v1/trigger {event,email,data}</code>. Use <code>{{var}}</code> for data.</p>` +
    `<div id="tg-list" style="margin-bottom:12px"></div>` +
    `<form id="tg-add" style="${AF}">` +
    `<input id="tg-event" placeholder="event name — e.g. order.shipped" style="max-width:260px">` +
    `<input id="tg-subject" placeholder="Subject — Hi {{name}}!">` +
    `<textarea id="tg-body" rows="4" placeholder="Markdown — Thanks {{name}}, your order {{order}} shipped." style="${TA}"></textarea>` +
    `<div class="row" style="gap:8px;justify-content:flex-start"><button class="btn sm" type="submit">Save trigger</button><span class="co-msg muted" style="font-size:13px;align-self:center"></span></div>` +
    `</form></div>`;
  const automations = d.groups.length
    ? welcomeCard + sequenceCard + winbackCard + rssCard + triggersCard
    : noLists + triggersCard;

  // ---- Settings ----
  const domainsCard =
    `<div class="card"><h2>Sending domains</h2><table><tbody>${domainRows}</tbody></table>` +
    `<form id="co-add-domain" class="row" style="margin-top:14px;gap:8px;justify-content:flex-start">` +
    `<input name="subdomain" placeholder="news.yourdomain.com" required style="max-width:240px">` +
    `<button class="btn sm" type="submit">+ Add domain</button>` +
    `<span class="co-msg muted" style="font-size:13px;align-self:center"></span></form>` +
    `<pre id="co-dns" style="display:none;background:#f4f4f5;border-radius:8px;padding:14px;margin-top:12px;font-size:12px;white-space:pre-wrap;word-break:break-all;font-family:'JetBrains Mono',Menlo,monospace"></pre></div>`;
  const brandCard =
    `<div class="card"><div class="row"><h2>Brand</h2><span class="muted">edit with <code>co brand set</code></span></div>` +
    `<table><tbody>` +
    `<tr><td>Name</td><td style="text-align:right">${escapeHtml(d.brand.name)}</td></tr>` +
    `<tr><td>Footer domain</td><td style="text-align:right"><code>${escapeHtml(d.brand.domain)}</code></td></tr>` +
    `<tr><td>Accent</td><td style="text-align:right"><span class="sw" style="background:${/^#[0-9a-fA-F]{3,8}$/.test(d.brand.color) ? d.brand.color : "#F59E0B"}"></span> <code>${escapeHtml(d.brand.color)}</code></td></tr>` +
    `<tr><td>Logo</td><td style="text-align:right">${d.brand.logoUrl ? "set" : '<span class="muted">name shown</span>'}</td></tr>` +
    `</tbody></table></div>`;
  const webhooksCard =
    `<div class="card"><div class="row"><h2>Event webhooks</h2><span class="muted">manage with <code>co webhooks</code></span></div>` +
    `<table><tbody>${
      d.webhooks.length
        ? d.webhooks
            .map(
              (w) =>
                `<tr><td><code>${escapeHtml(w.url)}</code></td><td style="text-align:right" class="muted">${escapeHtml(w.events)}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="2" class="muted">None — get events in your app with <code>co webhooks add &lt;https-url&gt;</code>.</td></tr>`
    }</tbody></table></div>`;
  const apikeysCard =
    `<div class="card"><h2>API keys</h2><table><tbody>${tokenRows}</tbody></table>` +
    `<form id="co-new-key" class="row" style="margin-top:14px;gap:8px;justify-content:flex-start">` +
    `<input name="name" placeholder="key name (e.g. ci)" style="max-width:200px">` +
    `<button class="btn sm" type="submit">+ Create key</button>` +
    `<span class="co-msg muted" style="font-size:13px;align-self:center"></span></form>` +
    `<pre id="co-newkey" style="display:none;background:#0d0d0d;color:#e6e6e6;border-radius:8px;padding:14px;margin-top:12px;font-size:13px;white-space:pre-wrap;word-break:break-all"></pre></div>`;
  const accountCard =
    `<div class="card"><h2>Account</h2>` +
    `<form id="co-email" class="row" style="gap:8px;justify-content:flex-start"><input name="email" type="email" value="${escapeAttr(d.email)}" style="max-width:260px"><button class="btn ghost sm" type="submit">Update email</button><span class="co-msg muted" style="font-size:13px;align-self:center"></span></form>` +
    `<p style="margin:18px 0 0"><button id="co-delete" class="btn ghost sm" style="border-color:#e0b4b4;color:#b00020">Delete account</button> <span class="muted" style="font-size:12px">Permanently deletes your lists, subscribers, and data.</span></p></div>`;

  const tabBtn = (id: string, label: string) =>
    `<button class="tabbtn" data-tab="${id}" type="button">${label}</button>`;
  const panel = (id: string, html: string) =>
    `<div class="tabpanel" id="tab-${id}">${html}</div>`;
  const tabCss =
    `<style>.tabbar{display:flex;gap:2px;border-bottom:1px solid #e7e7e7;margin:18px 0 22px;flex-wrap:wrap}` +
    `.tabbtn{border:0;background:none;padding:10px 16px;font:inherit;font-size:15px;color:#666;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}` +
    `.tabbtn:hover{color:#0a0a0a}.tabbtn.active{color:#0a0a0a;font-weight:600;border-bottom-color:#F59E0B}` +
    `.tabpanel{display:none}.tabpanel.active{display:block}</style>`;

  return (
    shell(
      "Dashboard",
      `<div class="row"><h1>Dashboard</h1>${planPill}</div>` +
        `<p class="muted">${escapeHtml(d.email)} · <a href="/logout">sign out</a></p>` +
        tabCss +
        `<div class="tabbar">${tabBtn("overview", "Overview")}${tabBtn("lists", "Lists")}${tabBtn("broadcasts", "Broadcasts")}${tabBtn("automations", "Automations")}${tabBtn("settings", "Settings")}</div>` +
        panel("overview", usageCard + recentCard) +
        panel("lists", firstRun + listsCard) +
        panel("broadcasts", broadcastsCard) +
        panel("automations", automations) +
        panel("settings", domainsCard + brandCard + webhooksCard + apikeysCard + accountCard) +
        // interactivity: tabs + all editors (same-origin, cookie auth)
        `<script>(function(){` +
        `var tabs=document.querySelectorAll('.tabbtn'),panels=document.querySelectorAll('.tabpanel');function showTab(id){tabs.forEach(function(t){t.classList.toggle('active',t.dataset.tab===id)});panels.forEach(function(p){p.classList.toggle('active',p.id==='tab-'+id)})}tabs.forEach(function(t){t.onclick=function(){showTab(t.dataset.tab);history.replaceState(null,'','#'+t.dataset.tab)}});showTab((location.hash||'#overview').slice(1)||'overview');` +
        `function api(m,p,b){return fetch(p,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json().catch(function(){return{ok:false,error:'http '+r.status}})})}` +
        `document.querySelectorAll('.copy-embed').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText(b.dataset.snippet).then(function(){var t=b.textContent;b.textContent='Copied \\u2713';setTimeout(function(){b.textContent=t},1500)})}});` +
        `var nl=document.getElementById('co-new-list');if(nl)nl.onsubmit=function(e){e.preventDefault();var m=nl.querySelector('.co-msg');m.textContent='Creating\\u2026';api('POST','/v1/groups',{slug:nl.slug.value.trim(),name:nl.name.value.trim()}).then(function(r){if(r.ok)location.reload();else m.textContent=r.error||'failed'})};` +
        `document.querySelectorAll('.list-del').forEach(function(b){b.onclick=function(){var n=b.dataset.name,c=+b.dataset.count;if(!confirm('Delete the list \\u201c'+n+'\\u201d'+(c>0?' and its '+c+' subscriber(s)':'')+'? This also removes its broadcasts and analytics, and cannot be undone.'))return;api('DELETE','/v1/groups/'+encodeURIComponent(b.dataset.slug)).then(function(r){if(r.ok)location.reload();else alert(r.error||'failed')})}});` +
        `var wl=document.getElementById('co-welcome');if(wl){var wls=document.getElementById('wl-list'),wsub=document.getElementById('wl-subject'),wbod=document.getElementById('wl-body'),wmsg=wl.querySelector('.co-msg');function loadWl(){api('GET','/v1/groups/'+encodeURIComponent(wls.value)+'/welcome').then(function(r){if(r.ok&&r.welcome){wsub.value=r.welcome.subject;wbod.value=r.welcome.body}else{wsub.value='';wbod.value=''}wmsg.textContent=''})}wls.onchange=loadWl;loadWl();wl.onsubmit=function(e){e.preventDefault();if(!wbod.value.trim()){wmsg.textContent='body required';return}wmsg.textContent='Saving\\u2026';api('PUT','/v1/groups/'+encodeURIComponent(wls.value)+'/welcome',{subject:wsub.value.trim(),body:wbod.value.trim()}).then(function(r){wmsg.textContent=r.ok?'Saved \\u2713':(r.error||'failed')})};document.getElementById('wl-off').onclick=function(){if(!confirm('Turn off the welcome email for this list?'))return;api('DELETE','/v1/groups/'+encodeURIComponent(wls.value)+'/welcome').then(function(r){if(r.ok){wsub.value='';wbod.value='';wmsg.textContent='Turned off'}})}}` +
        `var dns=document.getElementById('co-dns');function show(recs){dns.style.display='block';dns.textContent=recs.map(function(x){return '['+x.purpose+']  '+x.host+'  TXT\\n  '+x.value}).join('\\n\\n');dns.scrollIntoView({behavior:'smooth',block:'nearest'})}` +
        `var ad=document.getElementById('co-add-domain');if(ad)ad.onsubmit=function(e){e.preventDefault();var m=ad.querySelector('.co-msg');m.textContent='Adding\\u2026';api('POST','/v1/domains',{subdomain:ad.subdomain.value.trim()}).then(function(r){if(r.ok)location.reload();else m.textContent=r.error||'failed'})};` +
        `document.querySelectorAll('.dns-show').forEach(function(b){b.onclick=function(){api('GET','/v1/domains/'+b.dataset.id).then(function(r){if(r.ok)show(r.records)})}});` +
        `document.querySelectorAll('.dns-verify').forEach(function(b){b.onclick=function(){b.textContent='Checking\\u2026';api('POST','/v1/domains/'+b.dataset.id+'/verify',{}).then(function(r){if(r.ok&&r.status==='verified')location.reload();else if(r.ok){b.textContent='Verify';dns.style.display='block';dns.textContent='Not verified yet:\\n'+r.checks.map(function(c){return (c.ok?'\\u2713':'\\u2717')+' '+c.purpose+'  '+c.host}).join('\\n')}else{b.textContent='Verify';alert(r.error||'failed')}})}});` +
        `var nk=document.getElementById('co-new-key'),nkOut=document.getElementById('co-newkey');if(nk)nk.onsubmit=function(e){e.preventDefault();var m=nk.querySelector('.co-msg');m.textContent='Creating\\u2026';api('POST','/v1/tokens',{name:nk.name.value.trim()||'dashboard'}).then(function(r){if(r.ok){nkOut.style.display='block';nkOut.textContent=r.token+'\\n\\nCopy it now \\u2014 it won\\'t be shown again. Reload to see it listed.';m.textContent='';}else m.textContent=r.error||'failed'})};` +
        `document.querySelectorAll('.key-revoke').forEach(function(b){b.onclick=function(){if(!confirm('Revoke this API key?'))return;api('DELETE','/v1/tokens/'+b.dataset.id).then(function(r){if(r.ok)location.reload()})}});` +
        `var ef=document.getElementById('co-email');if(ef)ef.onsubmit=function(e){e.preventDefault();var m=ef.querySelector('.co-msg');m.textContent='Saving\\u2026';api('PATCH','/v1/account',{email:ef.email.value.trim()}).then(function(r){m.textContent=r.ok?'Saved \\u2713':(r.error||'failed')})};` +
        `var del=document.getElementById('co-delete');if(del)del.onclick=function(){if(!confirm('Delete your account and ALL data? This cannot be undone.'))return;if(prompt('Type DELETE to confirm')!=='DELETE')return;fetch('/v1/account',{method:'DELETE'}).then(function(){location.href='/'})};` +
        // sequence editor
        `var sqList=document.getElementById('sq-list');if(sqList){var sqSteps=document.getElementById('sq-steps'),sqAdd=document.getElementById('sq-add'),sqMsg=sqAdd.querySelector('.co-msg');function loadSq(){api('GET','/v1/groups/'+encodeURIComponent(sqList.value)+'/sequence').then(function(r){if(!r.ok){sqSteps.innerHTML='';return}sqSteps.innerHTML=r.steps.length?r.steps.map(function(s){return '<div class="row" style="justify-content:space-between;border-bottom:1px solid #eee;padding:6px 0"><span>+'+s.delay_minutes+'m \\u00b7 '+s.subject.replace(/</g,'&lt;')+'</span><button class="btn ghost sm sq-rm" data-id="'+s.id+'">Remove</button></div>'}).join(''):'<p class="muted">No steps yet.</p>';sqSteps.querySelectorAll('.sq-rm').forEach(function(b){b.onclick=function(){api('DELETE','/v1/groups/'+encodeURIComponent(sqList.value)+'/sequence/'+b.dataset.id).then(function(r){if(r.ok)loadSq()})}})})}sqList.onchange=loadSq;loadSq();sqAdd.onsubmit=function(e){e.preventDefault();var bd=document.getElementById('sq-body').value.trim();if(!bd){sqMsg.textContent='body required';return}sqMsg.textContent='Adding\\u2026';api('POST','/v1/groups/'+encodeURIComponent(sqList.value)+'/sequence',{delay:document.getElementById('sq-delay').value.trim()||'0',subject:document.getElementById('sq-subject').value.trim(),body:bd}).then(function(r){if(r.ok){document.getElementById('sq-subject').value='';document.getElementById('sq-body').value='';document.getElementById('sq-delay').value='';sqMsg.textContent='';loadSq()}else sqMsg.textContent=r.error||'failed'})}}` +
        // win-back editor
        `var wb=document.getElementById('co-winback');if(wb){var wbl=document.getElementById('wb-list'),wbd=document.getElementById('wb-days'),wbs=document.getElementById('wb-subject'),wbb=document.getElementById('wb-body'),wbm=wb.querySelector('.co-msg');function loadWb(){api('GET','/v1/groups/'+encodeURIComponent(wbl.value)+'/winback').then(function(r){if(r.ok&&r.winback){wbs.value=r.winback.subject;wbb.value=r.winback.body;wbd.value=r.winback.days}else{wbs.value='';wbb.value='';wbd.value=''}wbm.textContent=''})}wbl.onchange=loadWb;loadWb();wb.onsubmit=function(e){e.preventDefault();if(!wbb.value.trim()){wbm.textContent='body required';return}wbm.textContent='Saving\\u2026';api('PUT','/v1/groups/'+encodeURIComponent(wbl.value)+'/winback',{subject:wbs.value.trim(),body:wbb.value.trim(),days:+wbd.value||60}).then(function(r){wbm.textContent=r.ok?'Saved \\u2713':(r.error||'failed')})};document.getElementById('wb-off').onclick=function(){if(!confirm('Turn off win-back for this list?'))return;api('DELETE','/v1/groups/'+encodeURIComponent(wbl.value)+'/winback').then(function(r){if(r.ok){wbs.value='';wbb.value='';wbd.value='';wbm.textContent='Turned off'}})}}` +
        // rss editor
        `var rs=document.getElementById('co-rss');if(rs){var rsl=document.getElementById('rs-list'),rsu=document.getElementById('rs-url'),rsm=rs.querySelector('.co-msg');function loadRs(){api('GET','/v1/groups/'+encodeURIComponent(rsl.value)+'/rss').then(function(r){rsu.value=(r.ok&&r.rss)?r.rss.url:'';rsm.textContent=''})}rsl.onchange=loadRs;loadRs();rs.onsubmit=function(e){e.preventDefault();if(!rsu.value.trim()){rsm.textContent='feed url required';return}rsm.textContent='Saving\\u2026';api('PUT','/v1/groups/'+encodeURIComponent(rsl.value)+'/rss',{url:rsu.value.trim()}).then(function(r){rsm.textContent=r.ok?'Saved \\u2713 \\u2014 new posts auto-send':(r.error||'failed')})};document.getElementById('rs-off').onclick=function(){if(!confirm('Turn off RSS for this list?'))return;api('DELETE','/v1/groups/'+encodeURIComponent(rsl.value)+'/rss').then(function(r){if(r.ok){rsu.value='';rsm.textContent='Turned off'}})}}` +
        // triggers editor
        `var tgAdd=document.getElementById('tg-add');if(tgAdd){var tgList=document.getElementById('tg-list'),tgm=tgAdd.querySelector('.co-msg');function loadTg(){api('GET','/v1/triggers').then(function(r){if(!r.ok)return;tgList.innerHTML=r.triggers.length?r.triggers.map(function(t){return '<div class="row" style="justify-content:space-between;border-bottom:1px solid #eee;padding:6px 0"><span><code>'+t.event.replace(/</g,'&lt;')+'</code> \\u2192 '+t.subject.replace(/</g,'&lt;')+'</span><button class="btn ghost sm tg-rm" data-ev="'+encodeURIComponent(t.event)+'">Remove</button></div>'}).join(''):'<p class="muted">No triggers yet.</p>';tgList.querySelectorAll('.tg-rm').forEach(function(b){b.onclick=function(){api('DELETE','/v1/triggers/'+b.dataset.ev).then(function(r){if(r.ok)loadTg()})}})})}loadTg();tgAdd.onsubmit=function(e){e.preventDefault();var ev=document.getElementById('tg-event').value.trim(),bd=document.getElementById('tg-body').value.trim();if(!ev||!bd){tgm.textContent='event and body required';return}tgm.textContent='Saving\\u2026';api('PUT','/v1/triggers/'+encodeURIComponent(ev),{subject:document.getElementById('tg-subject').value.trim(),body:bd}).then(function(r){if(r.ok){tgm.textContent='Saved \\u2713';document.getElementById('tg-event').value='';document.getElementById('tg-subject').value='';document.getElementById('tg-body').value='';loadTg()}else tgm.textContent=r.error||'failed'})}}` +
        `})();</script>`,
    ) + ""
  );
};

export const broadcastDetailPage = (d: {
  subject: string;
  group: string;
  status: string;
  sent: number;
  opens: number;
  clicks: number;
  bounced: number;
  complained: number;
  sent_at: string | null;
  topLinks: { url: string; clicks: number }[];
}) => {
  const rate = (n: number) => (d.sent > 0 ? Math.round((n / d.sent) * 100) + "%" : "—");
  const stat = (label: string, val: string | number, sub = "") =>
    `<div style="flex:1;min-width:96px"><div style="font-size:26px;font-weight:700">${val}</div>` +
    `<div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">${label}${sub ? ` · ${sub}` : ""}</div></div>`;
  const links = d.topLinks.length
    ? d.topLinks
        .map(
          (l) =>
            `<tr><td><a href="${escapeAttr(l.url)}">${escapeHtml(l.url)}</a></td><td style="text-align:right">${l.clicks}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="muted">No link clicks recorded.</td></tr>`;
  return shell(
    "Broadcast",
    `<p><a href="/dashboard">&larr; Dashboard</a></p>` +
      `<div class="row"><h1>${escapeHtml(d.subject)}</h1><span class="pill ${d.status === "sent" ? "ok" : "wait"}">${escapeHtml(d.status)}</span></div>` +
      `<p class="muted">${escapeHtml(d.group)}${d.sent_at ? ` · sent ${escapeHtml(new Date(d.sent_at).toUTCString())}` : ""}</p>` +
      `<div class="card"><div class="row" style="gap:18px">` +
      stat("Sent", d.sent) +
      stat("Opens", d.opens, rate(d.opens)) +
      stat("Clicks", d.clicks, rate(d.clicks)) +
      stat("Bounced", d.bounced) +
      stat("Complaints", d.complained) +
      `</div></div>` +
      `<div class="card"><h2>Top links</h2><table><thead><tr><th>URL</th><th style="text-align:right">Clicks</th></tr></thead><tbody>${links}</tbody></table></div>`,
  );
};

// Small standalone message page (e.g. billing errors), reuses the shell.
export const messagePage = (title: string, html: string) => shell(title, html);
