// CodeOutbox — walking skeleton entrypoint.
// The one loop that matters: form submit → pending subscriber → confirm email → confirmed.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config";
import { initDb } from "./db";
import { ingest } from "./routes/ingest";
import { confirm } from "./routes/confirm";
import { requestClaim, completeClaim } from "./routes/claim";
import { dashboard, logout } from "./routes/dashboard";
import { demoFormPage, thanksPage } from "./pages";

await initDb();

const app = new Hono();

app.get("/health", (c) => c.text("ok"));
app.get("/", (c) => c.html(demoFormPage()));
app.get("/thanks", (c) => c.html(thanksPage()));

app.post("/f/:group", ingest);
app.get("/confirm/:token", confirm);

app.post("/claim", requestClaim);
app.get("/claim/:token", completeClaim);
app.get("/dashboard", dashboard);
app.get("/logout", logout);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `\nCodeOutbox skeleton running\n` +
      `  url:      ${config.baseUrl}\n` +
      `  db:       ${config.db.driver}\n` +
      `  email:    ${config.email.transport}\n` +
      `  try:      open ${config.baseUrl}/ and subscribe\n` +
      `  listening on :${info.port}\n`,
  );
});
