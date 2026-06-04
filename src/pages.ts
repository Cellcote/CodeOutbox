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
      `<form action="/f/newsletter" method="POST">` +
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
            `<tr><td>${g.name ?? g.slug}<br><span class="muted">${g.slug}</span></td>` +
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
