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
import { unsubscribeGet, unsubscribePost } from "./routes/unsubscribe";
import {
  previewBroadcastEndpoint,
  sendBroadcastEndpoint,
} from "./routes/broadcasts";
import { listGroups, createGroup, groupCount } from "./routes/groups";
import {
  addDomainEndpoint,
  listDomainsEndpoint,
  getDomainEndpoint,
  verifyDomainEndpoint,
} from "./routes/domains";
import {
  createTokenEndpoint,
  listTokensEndpoint,
  revokeTokenEndpoint,
} from "./routes/tokens";
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

app.get("/unsubscribe/:token", unsubscribeGet);
app.post("/unsubscribe/:token", unsubscribePost);

app.get("/v1/tokens", listTokensEndpoint);
app.post("/v1/tokens", createTokenEndpoint);
app.delete("/v1/tokens/:id", revokeTokenEndpoint);

app.get("/v1/groups", listGroups);
app.post("/v1/groups", createGroup);
app.get("/v1/groups/:slug/count", groupCount);

app.get("/v1/domains", listDomainsEndpoint);
app.post("/v1/domains", addDomainEndpoint);
app.get("/v1/domains/:id", getDomainEndpoint);
app.post("/v1/domains/:id/verify", verifyDomainEndpoint);

app.post("/v1/broadcasts/preview", previewBroadcastEndpoint);
app.post("/v1/broadcasts", sendBroadcastEndpoint);

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
