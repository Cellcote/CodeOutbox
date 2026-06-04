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
