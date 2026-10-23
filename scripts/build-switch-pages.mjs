// Generates the "switch from X" migration guides into site/switch/ (static, served
// as-is). Edit the data below and run: node scripts/build-switch-pages.mjs
//
// House rules for these pages: describe how to export from the other tool and how
// to import here; no price comparisons, no claims about their product, no logos;
// link their own help article; keep the not-affiliated notice.

import { mkdir, writeFile } from "node:fs/promises";

const CHECKED = "October 2026"; // when the export steps were last checked against each help center

const TOOLS = [
  {
    slug: "mailchimp",
    name: "Mailchimp",
    lead: "Mailchimp keeps subscribed, unsubscribed and cleaned contacts in one audience. You only need the subscribed ones.",
    steps: [
      "In Mailchimp, open <b>Audience</b> → <b>All contacts</b>.",
      "Choose <b>Export Audience</b>, then <b>Export as CSV</b>.",
      "Download the ZIP when it's ready and unzip it. It contains one CSV per contact type. Use the one with your <b>subscribed</b> contacts.",
    ],
    help: "https://mailchimp.com/help/view-export-contacts/",
    columns:
      "Email Address, First Name, Last Name and your own merge fields (such as Company) come across and work as merge tags. Mailchimp's internal columns, like MEMBER_RATING, OPTIN_TIME and LEID, are skipped.",
    stays: "Campaign history, templates and automations stay in Mailchimp. Recreate your welcome email and follow-ups as short Markdown files in CodeOutbox.",
    file: "subscribed_members.csv",
  },
  {
    slug: "kit",
    name: "Kit",
    aka: "formerly ConvertKit",
    lead: "Kit can export only your confirmed subscribers, which is exactly the list you want to bring.",
    steps: [
      "In Kit, go to <b>Subscribers</b> and set the <b>Status</b> filter to <b>Confirmed</b>.",
      "Select all subscribers (click <b>Select all</b> if it appears), open the <b>⋯</b> menu and choose <b>Export</b>.",
      "Kit emails you a download link. It expires after five days, so download the CSV soon.",
    ],
    help: "https://help.kit.com/en/articles/2502489-how-to-export-subscribers",
    columns:
      "Email address, first name and your custom fields come across as merge fields. If the file has a Status column, cancelled and bounced subscribers are left out. Location columns are kept as fields.",
    stays: "Sequences, visual automations and your broadcast history stay in Kit. Rebuild a sequence as timed follow-up emails in CodeOutbox.",
    file: "kit-subscribers.csv",
  },
  {
    slug: "substack",
    name: "Substack",
    lead: "Substack lets you export your mailing list as a CSV from the subscriber dashboard.",
    steps: [
      "In your Substack dashboard, open <b>Subscribers</b>.",
      "Click <b>Export</b> and export the entire list as a CSV, with all columns.",
      "Download the file. That's the one to import.",
    ],
    help: "https://on.substack.com/p/subscriber-dashboard-guide",
    columns: "Email addresses come across. Activity and subscription columns are ignored.",
    stays:
      "Your posts stay on Substack, and so do paid subscriptions: CodeOutbox doesn't handle payments. If you have paying subscribers, keep their billing where it is and tell them what's changing before you move their email.",
    file: "substack-subscribers.csv",
  },
  {
    slug: "buttondown",
    name: "Buttondown",
    lead: "Buttondown exports every subscriber with their type, so CodeOutbox can tell who's still active.",
    steps: [
      "In Buttondown, open the <b>Subscribers</b> tab.",
      "Click <b>Export</b> to download a CSV.",
      "That's the file to import.",
    ],
    help: "https://docs.buttondown.com/data-exports-subscriber",
    columns:
      "Email addresses and your metadata come across. Subscribers whose type marks them as unsubscribed or never activated are left out.",
    stays: "Your archive and sending history stay in Buttondown. CodeOutbox can host a public archive for the issues you send from now on.",
    file: "buttondown-subscribers.csv",
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--ink:#0A0A0A;--amber:#F59E0B;--amber-ink:#a86b00;--muted:#5f5f66;--line:#e7e7e7;--code:#0D0D0D;--soft:#fafafa}
*{box-sizing:border-box}
body{font-family:'Inter',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.65;margin:0;background:#fff}
.bar{background:var(--ink);padding:14px 0}
.wrap{max-width:760px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.bar .wrap{display:flex;justify-content:space-between;align-items:center;max-width:1040px}
.brand{font-family:'JetBrains Mono',Menlo,monospace;font-weight:600;color:#fafafa;text-decoration:none;font-size:18px;letter-spacing:-.5px}
.brand .b{color:var(--amber)}
.bar nav{display:flex;gap:18px;font-size:13px}.bar nav a{color:#bbb;text-decoration:none}.bar nav a:hover{color:#fff}
main{padding:44px 0 72px}
.eyebrow{font:500 12px/1 'JetBrains Mono',Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--amber-ink)}
h1{font-size:clamp(30px,5vw,40px);line-height:1.15;letter-spacing:-.02em;margin:12px 0 12px;text-wrap:balance}
h2{font-size:21px;margin:40px 0 10px;letter-spacing:-.01em}
.lead{font-size:18px;color:#3d3d44;margin:0}
p,li{max-width:64ch}
a{color:#b97400}
code{font-family:'JetBrains Mono',Menlo,monospace;background:#f4f4f5;padding:1px 6px;border-radius:4px;font-size:.88em}
pre{background:var(--code);color:#e6e6e6;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:13px;line-height:1.55;margin:8px 0}
pre code{background:none;padding:0;color:inherit}
ol.steps{counter-reset:s;list-style:none;padding:0;margin:14px 0}
ol.steps>li{counter-increment:s;position:relative;padding:0 0 14px 40px}
ol.steps>li::before{content:counter(s);position:absolute;left:0;top:1px;width:26px;height:26px;border-radius:50%;border:2px solid var(--amber);display:grid;place-items:center;font:600 12px/1 'JetBrains Mono',Menlo,monospace;color:var(--amber-ink)}
.box{border:1px solid var(--line);border-radius:12px;padding:18px 20px;background:var(--soft);margin:14px 0}
.box h3{margin:0 0 6px;font-size:15px}.box p{margin:0;color:var(--muted);font-size:15px}
.ways{display:grid;gap:12px;margin:12px 0}
.way{border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.way>b{display:block;margin-bottom:4px}.way p{margin:0 0 6px;color:var(--muted);font-size:15px}
.cta{display:inline-block;background:var(--amber);color:#1a1200;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:9px;margin-top:6px}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:22px 0}@media(max-width:560px){.cards{grid-template-columns:1fr}}
.card{border:1px solid var(--line);border-radius:12px;padding:18px;text-decoration:none;color:inherit;display:grid;gap:4px}
.card:hover{border-color:var(--amber)}.card b{font-size:17px}.card span{color:var(--muted);font-size:14px}
.legal{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px;padding:22px 0}
footer a{color:var(--muted)}
`;

function page({ title, description, path, body }) {
  const url = `https://codeoutbox.com${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="https://codeoutbox.com/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
<header class="bar"><div class="wrap"><a class="brand" href="/"><span class="b">[&#8593;]</span> CodeOutbox</a><nav><a href="/switch/">Switching</a><a href="/docs.html">Docs</a><a href="https://app.codeoutbox.com">Start free</a></nav></div></header>
<main><div class="wrap">
${body}
</div></main>
<footer><div class="wrap">© 2026 CodeOutbox · <a href="/">Home</a> · <a href="/docs.html">Docs</a> · <a href="/switch/">Switching guides</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></div></footer>
</body>
</html>
`;
}

function toolPage(t) {
  const label = t.aka ? `${t.name} (${t.aka})` : t.name;
  const body = `
<span class="eyebrow">Switching guide</span>
<h1>Move your newsletter from ${esc(t.name)} to CodeOutbox</h1>
<p class="lead">Bring your subscribers over in about ten minutes. People who already opted in stay subscribed, without confirming again. ${esc(t.lead)}</p>

<h2>1. Export your subscribers from ${esc(label)}</h2>
<ol class="steps">${t.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
<p>Menus change from time to time. If something looks different, <a href="${t.help}" rel="nofollow noopener" target="_blank">${esc(t.name)}'s own export guide</a> has the current steps.</p>

<h2>2. Create your list</h2>
<p>Start at <a href="https://app.codeoutbox.com">app.codeoutbox.com</a> with your email, or run <code>npx codeoutbox</code> in your site's folder to add a signup form and create the list in one go. Free for up to 100 subscribers, no card.</p>

<h2>3. Import the file</h2>
<div class="ways">
  <div class="way"><b>In the dashboard</b><p>Lists → <b>Import subscribers</b>. Pick the file and choose “Yes, they subscribed with my old tool”.</p></div>
  <div class="way"><b>From your terminal</b><p>With an API key from Settings → API keys:</p><pre><code>CO_TOKEN=co_live_… npx codeoutbox import newsletter ${esc(t.file)} --confirmed</code></pre></div>
  <div class="way"><b>With your coding agent</b><p>With the <a href="/docs.html#agent">CodeOutbox MCP server</a> installed, ask: “import ${esc(t.file)} into my newsletter, they already opted in”.</p></div>
</div>
<div class="box"><h3>What comes across</h3><p>${esc(t.columns)} You can use any column in your emails, like <code>{{first_name | "there"}}</code>.</p></div>
<div class="box"><h3>What stays behind</h3><p>${esc(t.stays)}</p></div>
<p>Only import people who signed up to hear from you. If you're not sure about part of the list, choose “Email each of them a confirmation link” instead. They'll be added once they confirm.</p>

<h2>4. Swap your signup form</h2>
<p>Replace the old embed with a form that posts to CodeOutbox. In your site's folder:</p>
<pre><code>npx codeoutbox --id YOUR_FORM_ID</code></pre>
<p>It detects React, Next.js, Vue, Svelte, Astro or plain HTML and writes a styled form component. Your form id is on the dashboard. No website? Every list also has a hosted signup page you can link to.</p>

<h2>5. Send from your own domain</h2>
<p>Add your domain under Settings → Sending domains and publish the DNS records it shows. Your emails then come from your own address, which helps them reach the inbox. A short first note (“we've moved our newsletter”) helps readers recognize the new sender.</p>

<p><a class="cta" href="https://app.codeoutbox.com">Start free</a></p>

<p class="legal">${esc(t.name)} is a trademark of its owner. CodeOutbox is not affiliated with, endorsed by or sponsored by ${esc(t.name)}. The export steps above were checked against ${esc(t.name)}'s help center in ${CHECKED} and may change.</p>
`;
  return page({
    title: `Move your newsletter from ${t.name} to CodeOutbox`,
    description: `Step by step: export your subscribers from ${t.name}, import them into CodeOutbox without re-confirming, and swap your signup form.`,
    path: `/switch/${t.slug}/`,
    body,
  });
}

function hub() {
  const body = `
<span class="eyebrow">Switching guides</span>
<h1>Bring your newsletter to CodeOutbox</h1>
<p class="lead">Export your subscribers as a CSV, import it as-is, and swap your signup form. People who already opted in stay subscribed. Most moves take about ten minutes.</p>
<div class="cards">
${TOOLS.map((t) => `<a class="card" href="/switch/${t.slug}/"><b>From ${esc(t.name)}</b><span>${esc(t.lead)}</span></a>`).join("\n")}
</div>
<h2>From anywhere else</h2>
<p>Any CSV with an email column works, including a spreadsheet export. Common headers like <code>Email Address</code>, <code>First Name</code> and <code>Status</code> are recognized, unsubscribed and bounced rows are left out, and other columns become merge fields. Import it under Lists → <b>Import subscribers</b>, or with <code>npx codeoutbox import &lt;list&gt; &lt;file.csv&gt; --confirmed</code>.</p>
<p><a class="cta" href="https://app.codeoutbox.com">Start free</a></p>
<p class="legal">Product names are trademarks of their owners. CodeOutbox is not affiliated with, endorsed by or sponsored by any of them.</p>
`;
  return page({
    title: "Switch to CodeOutbox: move your newsletter",
    description: "Guides for moving your newsletter subscribers to CodeOutbox from Mailchimp, Kit, Substack, Buttondown or any CSV.",
    path: "/switch/",
    body,
  });
}

await mkdir("site/switch", { recursive: true });
await writeFile("site/switch/index.html", hub());
for (const t of TOOLS) {
  await mkdir(`site/switch/${t.slug}`, { recursive: true });
  await writeFile(`site/switch/${t.slug}/index.html`, toolPage(t));
}
console.log(`wrote site/switch/ (${TOOLS.length} guides + index)`);
