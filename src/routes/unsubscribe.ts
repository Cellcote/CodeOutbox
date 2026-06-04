// GET/POST /unsubscribe/:token — sets the subscriber to unsubscribed and writes
// an account-scoped suppression so future broadcasts skip them. POST supports the
// one-click List-Unsubscribe-Post flow.

import type { Context } from "hono";
import { query, queryOne } from "../db";
import { verifyUnsub } from "../tokens";
import { unsubscribedPage, confirmErrorPage } from "../pages";

async function doUnsub(subscriberId: number): Promise<boolean> {
  const row = await queryOne<{
    email: string;
    owner_account_id: number | null;
  }>(
    `SELECT s.email, g.owner_account_id
       FROM subscribers s JOIN groups g ON g.id = s.group_id
      WHERE s.id = $1`,
    [subscriberId],
  );
  if (!row) return false;

  await query(`UPDATE subscribers SET status = 'unsubscribed' WHERE id = $1`, [
    subscriberId,
  ]);

  if (row.owner_account_id) {
    await query(
      `INSERT INTO suppressions (account_id, email, reason)
       VALUES ($1, $2, 'unsubscribe')
       ON CONFLICT (account_id, email) DO NOTHING`,
      [row.owner_account_id, row.email],
    );
  }
  return true;
}

export async function unsubscribeGet(c: Context) {
  const token = c.req.param("token");
  const sid = token ? await verifyUnsub(token) : null;
  if (!sid) return c.html(confirmErrorPage(), 400);
  await doUnsub(sid);
  return c.html(unsubscribedPage());
}

export async function unsubscribePost(c: Context) {
  // One-click: best-effort, always 200 so mail clients don't show an error.
  const token = c.req.param("token");
  const sid = token ? await verifyUnsub(token) : null;
  if (sid) await doUnsub(sid);
  return c.body(null, 200);
}
