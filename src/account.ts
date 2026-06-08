// Account-level operations: change email, and full (GDPR) account deletion.

import { query, queryOne } from "./db";

export async function changeEmail(
  accountId: number,
  email: string,
): Promise<void> {
  const clash = await queryOne<{ id: number }>(
    `SELECT id FROM accounts WHERE email = $1 AND id <> $2`,
    [email, accountId],
  );
  if (clash) throw new Error("that email is already in use");
  await query(`UPDATE accounts SET email = $1 WHERE id = $2`, [email, accountId]);
}

// Hard-delete the account and everything it owns (children first to satisfy FKs).
export async function deleteAccount(accountId: number): Promise<void> {
  await query(
    `DELETE FROM tracking_events WHERE broadcast_id IN (SELECT id FROM broadcasts WHERE account_id = $1)`,
    [accountId],
  );
  await query(
    `DELETE FROM broadcast_recipients WHERE broadcast_id IN (SELECT id FROM broadcasts WHERE account_id = $1)`,
    [accountId],
  );
  await query(`DELETE FROM broadcasts WHERE account_id = $1`, [accountId]);
  await query(
    `DELETE FROM subscribers WHERE group_id IN (SELECT id FROM groups WHERE owner_account_id = $1)`,
    [accountId],
  );
  await query(`DELETE FROM groups WHERE owner_account_id = $1`, [accountId]);
  await query(`DELETE FROM suppressions WHERE account_id = $1`, [accountId]);
  await query(`DELETE FROM webhooks WHERE account_id = $1`, [accountId]);
  await query(`DELETE FROM domains WHERE account_id = $1`, [accountId]);
  await query(`DELETE FROM api_tokens WHERE account_id = $1`, [accountId]);
  await query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
}
