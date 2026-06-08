// Authd sequence (drip) endpoints (wrapped by `co sequence`).
//   GET    /v1/groups/:slug/sequence          → list steps
//   POST   /v1/groups/:slug/sequence          → add { delay, subject, body }
//   DELETE /v1/groups/:slug/sequence/:stepId  → remove a step

import type { Context } from "hono";
import { getAccountId } from "../auth";
import { listSteps, addStep, removeStep } from "../sequence";
import { parseDelay } from "../automations";

export async function listSequenceEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const steps = await listSteps(accountId, c.req.param("slug") ?? "");
  return c.json({ ok: true, steps });
}

export async function addSequenceStepEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const delay =
    typeof body.delay === "number" ? body.delay : parseDelay(String(body.delay ?? "0"));
  const subject = String(body.subject ?? "").trim();
  const md = String(body.body ?? "").trim();
  if (!md) return c.json({ ok: false, error: "body is required" }, 400);
  const step = await addStep(
    accountId,
    c.req.param("slug") ?? "",
    delay,
    subject || "Hello",
    md,
  );
  if (!step) return c.json({ ok: false, error: "group not found" }, 404);
  return c.json({ ok: true, step });
}

export async function removeSequenceStepEndpoint(c: Context) {
  const accountId = await getAccountId(c);
  if (!accountId) return c.json({ ok: false, error: "unauthorized" }, 401);
  const ok = await removeStep(
    accountId,
    c.req.param("slug") ?? "",
    Number(c.req.param("stepId")),
  );
  if (!ok) return c.json({ ok: false, error: "step not found" }, 404);
  return c.json({ ok: true });
}
