// Tiny HTML responses: the demo form, the /thanks page, and confirm result pages.

const shell = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${title}</title>` +
  `<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#111}` +
  `input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #ccc}` +
  `button{background:#111;color:#fff;border:0;cursor:pointer}` +
  `.muted{color:#666}.ok{color:#127c2b}.err{color:#b00020}</style></head>` +
  `<body>${body}</body></html>`;

export const demoFormPage = () =>
  shell(
    "CodeOutbox — demo form",
    `<h1>CodeOutbox</h1>` +
      `<p class="muted">Walking skeleton: submit → double opt-in → confirm.</p>` +
      `<form action="/f/demo" method="POST">` +
      `<p><input type="email" name="email" placeholder="you@example.com" required style="width:260px"></p>` +
      `<input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">` +
      `<button type="submit">Subscribe</button>` +
      `</form>`,
  );

export const thanksPage = () =>
  shell(
    "Thanks",
    `<h1>Almost there ✉️</h1>` +
      `<p>Check your inbox and click the confirmation link to finish subscribing.</p>` +
      `<p class="muted">(Using the console transport? The link is printed in the server logs.)</p>`,
  );

export const confirmedPage = (email: string) =>
  shell(
    "Confirmed",
    `<h1 class="ok">You're confirmed 🎉</h1>` +
      `<p><strong>${email}</strong> is now subscribed.</p>`,
  );

export const confirmErrorPage = () =>
  shell(
    "Link invalid",
    `<h1 class="err">That link didn't work</h1>` +
      `<p class="muted">It may have expired or already been used. Try subscribing again.</p>`,
  );

export const signupFormPage = () =>
  shell(
    "Sign up — CodeOutbox",
    `<h1>Get started</h1>` +
      `<p class="muted">Enter your email — we'll send a sign-in link and your API key. No password, no credit card.</p>` +
      `<form action="/signup" method="POST">` +
      `<p><input type="email" name="email" placeholder="you@yourdomain.com" required style="width:260px"></p>` +
      `<button type="submit">Send my link</button>` +
      `</form>`,
  );

export const signupSentPage = (email: string) =>
  shell(
    "Check your inbox",
    `<h1>Check your inbox 📨</h1>` +
      `<p>We sent a sign-in link to <strong>${email}</strong>. Open it to get your API key.</p>` +
      `<p class="muted">(Console transport? The link is in the server logs.)</p>`,
  );

export const signupKeyPage = (email: string, apiKey: string) =>
  shell(
    "Your API key",
    `<h1 class="ok">You're in 🎉</h1>` +
      `<p>Signed in as <strong>${email}</strong>. Here's your API key — <strong>copy it now, it won't be shown again</strong>:</p>` +
      `<p><code style="display:block;padding:12px;background:#f0f0f0;border-radius:8px;word-break:break-all">${apiKey}</code></p>` +
      `<h3>Next</h3>` +
      `<ol class="muted">` +
      `<li>Create a list: <code>POST /v1/groups</code> (or use the CLI: <code>co sync</code>)</li>` +
      `<li>Add subscribers: embed the form, or <code>POST /v1/groups/{list}/subscribers</code></li>` +
      `<li>Send: <code>POST /v1/broadcasts</code> (or <code>co send</code>)</li>` +
      `</ol>` +
      `<p><a href="/dashboard">Go to dashboard →</a></p>`,
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
      `<p>We sent a claim link to <strong>${email}</strong>. Open it to take ownership of the list.</p>` +
      `<p class="muted">(Console transport? The link is in the server logs.)</p>`,
  );

export const notLoggedInPage = () =>
  shell(
    "Not signed in",
    `<h1>Not signed in</h1>` +
      `<p class="muted">Claim a list to get a dashboard. POST to <code>/claim</code> ` +
      `with a <code>group</code> and your <code>email</code>.</p>`,
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

export const dashboardPage = (
  email: string,
  groups: GroupRow[],
  recent: RecentRow[],
) => {
  const groupRows = groups.length
    ? groups
        .map(
          (g) =>
            `<tr><td>${g.name ?? g.slug}<br>` +
            `<span class="muted">${g.slug} · <code>/f/${g.public_id}</code></span></td>` +
            `<td style="text-align:right">${g.confirmed}</td>` +
            `<td style="text-align:right" class="muted">${g.total}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No lists yet.</td></tr>`;

  const recentRows = recent.length
    ? recent
        .map(
          (r) =>
            `<tr><td>${r.email}</td><td class="muted">${r.slug}</td>` +
            `<td><span class="${r.status === "confirmed" ? "ok" : "muted"}">${r.status}</span></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No subscribers yet.</td></tr>`;

  return shell(
    "Dashboard",
    `<h1>Dashboard</h1>` +
      `<p class="muted">Signed in as <strong>${email}</strong> · <a href="/logout">sign out</a></p>` +
      `<h3>Your lists</h3>` +
      `<table style="width:100%;border-collapse:collapse">` +
      `<thead><tr><th style="text-align:left">List</th><th style="text-align:right">Confirmed</th>` +
      `<th style="text-align:right">Total</th></tr></thead><tbody>${groupRows}</tbody></table>` +
      `<h3>Recent subscribers</h3>` +
      `<table style="width:100%;border-collapse:collapse">` +
      `<thead><tr><th style="text-align:left">Email</th><th style="text-align:left">List</th>` +
      `<th style="text-align:left">Status</th></tr></thead><tbody>${recentRows}</tbody></table>`,
  );
};
