// CodeOutbox — walking skeleton entrypoint.
// The one loop that matters: form submit → pending subscriber → confirm email → confirmed.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { initDb } from "./db";
import { ingest } from "./routes/ingest";
import { rateLimit } from "./ratelimit";
import { reportError } from "./errors";
import { confirm } from "./routes/confirm";
import { requestClaim, completeClaim } from "./routes/claim";
import {
  dashboard,
  logout,
  upgradeRedirect,
  portalRedirect,
  broadcastDetailEndpoint,
} from "./routes/dashboard";
import { unsubscribeGet, unsubscribePost } from "./routes/unsubscribe";
import { badge } from "./routes/badge";
import { emailEvent } from "./routes/email-event";
import {
  previewBroadcastEndpoint,
  sendBroadcastEndpoint,
  listBroadcastsEndpoint,
  testBroadcastEndpoint,
} from "./routes/broadcasts";
import { trackOpen, trackClick } from "./routes/tracking";
import {
  listGroups,
  createGroup,
  groupCount,
  deleteGroupEndpoint,
} from "./routes/groups";
import { usageEndpoint } from "./routes/usage";
import {
  getAccountEndpoint,
  updateAccountEndpoint,
  deleteAccountEndpoint,
} from "./routes/account";
import { warmupEndpoint } from "./routes/warmup";
import {
  listWebhooksEndpoint,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
} from "./routes/webhooks";
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
import {
  getWelcomeEndpoint,
  setWelcomeEndpoint,
  deleteWelcomeEndpoint,
} from "./routes/welcome";
import {
  listSequenceEndpoint,
  addSequenceStepEndpoint,
  removeSequenceStepEndpoint,
} from "./routes/sequence";
import {
  listTriggersEndpoint,
  setTriggerEndpoint,
  deleteTriggerEndpoint,
  fireTriggerEndpoint,
} from "./routes/triggers";
import { demoFormPage, thanksPage } from "./pages";
import { registerJob, startWorker } from "./queue";
import { runBroadcastJob } from "./broadcast";
import { runWelcomeJob } from "./welcome";
import { runSequenceJob } from "./sequence";
import { runConfirmReminderJob } from "./reminders";

await initDb();

// Durable job queue: register handlers + start the background worker.
registerJob("broadcast.send", runBroadcastJob);
registerJob("welcome.send", runWelcomeJob);
registerJob("sequence.send", runSequenceJob);
registerJob("confirm.reminder", runConfirmReminderJob);
startWorker();

const app = new Hono();

// Catch-all: report unhandled errors (logs + optional webhook) and return a clean 500.
app.onError((err, c) => {
  reportError(`${c.req.method} ${c.req.path}`, err);
  return c.json({ ok: false, error: "internal server error" }, 500);
});

// Form ingest is meant to be embedded on any site → allow cross-origin POST so the
// JS-enhanced inline success works (e.g. the marketing site at the apex posting here).
app.use("/f/*", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));

app.get("/health", (c) => c.text("ok"));
app.get("/", (c) => c.html(demoFormPage()));
app.get("/thanks", (c) => c.html(thanksPage()));

app.post(
  "/f/:group",
  rateLimit({ windowMs: 60_000, max: 15, message: "Too many submissions — try again shortly." }),
  ingest,
);
app.get("/confirm/:token", confirm);

app.get("/signup", signupForm);
app.post(
  "/signup",
  rateLimit({ windowMs: 15 * 60_000, max: 5, message: "Too many sign-in requests — try again in a few minutes." }),
  requestSignup,
);
app.get("/signup/:token", completeSignup);

app.post(
  "/claim",
  rateLimit({ windowMs: 15 * 60_000, max: 5, message: "Too many claim requests — try again in a few minutes." }),
  requestClaim,
);
app.get("/claim/:token", completeClaim);
app.get("/dashboard", dashboard);
app.get("/dashboard/upgrade", upgradeRedirect);
app.get("/dashboard/billing", portalRedirect);
app.get("/dashboard/broadcasts/:id", broadcastDetailEndpoint);
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
app.delete("/v1/account", deleteAccountEndpoint);
app.get("/v1/warmup", warmupEndpoint);

app.get("/v1/webhooks", listWebhooksEndpoint);
app.post("/v1/webhooks", createWebhookEndpoint);
app.delete("/v1/webhooks/:id", deleteWebhookEndpoint);

app.post("/v1/billing/checkout", checkoutEndpoint);
app.post("/v1/billing/portal", portalEndpoint);

app.get("/v1/tokens", listTokensEndpoint);
app.post("/v1/tokens", createTokenEndpoint);
app.delete("/v1/tokens/:id", revokeTokenEndpoint);

app.get("/v1/groups", listGroups);
app.post("/v1/groups", createGroup);
app.delete("/v1/groups/:slug", deleteGroupEndpoint);
app.get("/v1/groups/:slug/count", groupCount);
app.get("/v1/groups/:slug/welcome", getWelcomeEndpoint);
app.put("/v1/groups/:slug/welcome", setWelcomeEndpoint);
app.delete("/v1/groups/:slug/welcome", deleteWelcomeEndpoint);
app.get("/v1/groups/:slug/sequence", listSequenceEndpoint);
app.post("/v1/groups/:slug/sequence", addSequenceStepEndpoint);
app.delete("/v1/groups/:slug/sequence/:stepId", removeSequenceStepEndpoint);

app.get("/v1/triggers", listTriggersEndpoint);
app.put("/v1/triggers/:event", setTriggerEndpoint);
app.delete("/v1/triggers/:event", deleteTriggerEndpoint);
app.post("/v1/trigger", fireTriggerEndpoint);

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
app.get("/v1/broadcasts", listBroadcastsEndpoint);
app.post("/v1/broadcasts/test", testBroadcastEndpoint);

app.get("/t/o/:token", trackOpen);
app.get("/t/c/:token", trackClick);

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
