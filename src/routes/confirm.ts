// GET /confirm/:token — completes double opt-in: flips pending → confirmed.

import type { Context } from "hono";
import { queryOne } from "../db";
import { verifyToken } from "../tokens";
import { confirmedPage, confirmErrorPage } from "../pages";

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

  return c.html(confirmedPage(row.email));
}
