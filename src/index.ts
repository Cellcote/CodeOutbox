// CodeOutbox — walking skeleton entrypoint.
// The one loop that matters: form submit → pending subscriber → confirm email → confirmed.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { initDb } from "./db";
import { ingest } from "./routes/ingest";
import { confirm } from "./routes/confirm";
import { requestClaim, completeClaim } from "./routes/claim";
import {
  dashboard,
  logout,
  upgradeRedirect,
  portalRedirect,
} from "./routes/dashboard";
import { unsubscribeGet, unsubscribePost } from "./routes/unsubscribe";
import { badge } from "./routes/badge";
import { emailEvent } from "./routes/email-event";
import {
  previewBroadcastEndpoint,
  sendBroadcastEndpoint,
} from "./routes/broadcasts";
import { listGroups, createGroup, groupCount } from "./routes/groups";
import { usageEndpoint } from "./routes/usage";
import {
  getAccountEndpoint,
  updateAccountEndpoint,
} from "./routes/account";
import { warmupEndpoint } from "./routes/warmup";
import { checkoutEndpoint, portalEndpoint } from "./routes/billing";
import { stripeWebhook } from "./routes/stripe-webhook";
import { signupForm, requestSignup, completeSignup } from "./routes/signup";
import {
  addSubscriber,
  importSubscribers,
  listSubscribers,
  removeSubscriber,
} from "./routes/subscribers";
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

// Form ingest is meant to be embedded on any site → allow cross-origin POST so the
// JS-enhanced inline success works (e.g. the marketing site at the apex posting here).
app.use("/f/*", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));

app.get("/health", (c) => c.text("ok"));
app.get("/", (c) => c.html(demoFormPage()));
app.get("/thanks", (c) => c.html(thanksPage()));

app.post("/f/:group", ingest);
app.get("/confirm/:token", confirm);

app.get("/signup", signupForm);
app.post("/signup", requestSignup);
app.get("/signup/:token", completeSignup);

app.post("/claim", requestClaim);
app.get("/claim/:token", completeClaim);
app.get("/dashboard", dashboard);
app.get("/dashboard/upgrade", upgradeRedirect);
app.get("/dashboard/billing", portalRedirect);
app.get("/logout", logout);
app.get("/login", (c) => c.redirect("/signup", 302));

app.get("/unsubscribe/:token", unsubscribeGet);
app.post("/unsubscribe/:token", unsubscribePost);

app.get("/badge/:slug", badge);

app.post("/webhooks/email-event", emailEvent);
app.post("/webhooks/stripe", stripeWebhook);

app.get("/v1/usage", usageEndpoint);

app.get("/v1/account", getAccountEndpoint);
app.patch("/v1/account", updateAccountEndpoint);
app.get("/v1/warmup", warmupEndpoint);

app.post("/v1/billing/checkout", checkoutEndpoint);
app.post("/v1/billing/portal", portalEndpoint);

app.get("/v1/tokens", listTokensEndpoint);
app.post("/v1/tokens", createTokenEndpoint);
app.delete("/v1/tokens/:id", revokeTokenEndpoint);

app.get("/v1/groups", listGroups);
app.post("/v1/groups", createGroup);
app.get("/v1/groups/:slug/count", groupCount);

app.get("/v1/groups/:group/subscribers", listSubscribers);
app.post("/v1/groups/:group/subscribers", addSubscriber);
app.post("/v1/groups/:group/subscribers/import", importSubscribers);
app.delete("/v1/groups/:group/subscribers/:email", removeSubscriber);

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
