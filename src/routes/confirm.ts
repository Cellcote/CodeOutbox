// GET /confirm/:token — completes double opt-in: flips pending → confirmed.

import type { Context } from "hono";
import { queryOne } from "../db";
import { verifyToken } from "../tokens";
import { confirmedPage, confirmErrorPage } from "../pages";
import { emitEvent } from "../webhooks";
import { triggerWelcome } from "../welcome";

export async function confirm(c: Context) {
  const token = c.req.param("token");
  if (!token) return c.html(confirmErrorPage(), 400);
  const payload = await verifyToken(token, "confirm");
  if (!payload) return c.html(confirmErrorPage(), 400);

  const row = await queryOne<{ email: string }>(
    `UPDATE subscribers
        SET status = 'confirmed',
            consent_timestamp = COALESCE(consent_timestamp, now())
      WHERE id = $1 AND status <> 'unsubscribed'
      RETURNING email`,
    [payload.sub],
  );
  if (!row) return c.html(confirmErrorPage(), 400);

  const meta = await queryOne<{
    owner_account_id: number | null;
    slug: string;
    group_id: number;
  }>(
    `SELECT g.owner_account_id, g.slug, s.group_id
       FROM subscribers s JOIN groups g ON g.id = s.group_id WHERE s.id = $1`,
    [payload.sub],
  );
  emitEvent(meta?.owner_account_id, "subscriber.confirmed", {
    email: row.email,
    group: meta?.slug,
  });
  if (meta?.group_id) await triggerWelcome(Number(payload.sub), meta.group_id);

  return c.html(confirmedPage(row.email));
}
