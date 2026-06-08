// Confirmation reminder: subscribers who sign up but never click the opt-in link
// get one more nudge after a delay — recovering signups that would otherwise be lost.

import { queryOne } from "./db";
import { enqueue } from "./queue";
import { signToken } from "./tokens";
import { confirmEmail } from "./email/templates";
import { sendSystemEmail } from "./sender";
import { config } from "./config";

// Called right after the first opt-in email is sent (double-opt-in signups).
export async function scheduleConfirmReminder(subscriberId: number): Promise<void> {
  if (!config.confirmReminder.enabled) return;
  const runAt = new Date(
    Date.now() + config.confirmReminder.delayMinutes * 60_000,
  );
  await enqueue("confirm.reminder", { subscriberId }, runAt);
}

export async function runConfirmReminderJob(payload: {
  subscriberId: number;
}): Promise<void> {
  // Only nudge if they're still pending (not confirmed, not unsubscribed).
  const sub = await queryOne<{ email: string }>(
    `SELECT email FROM subscribers WHERE id = $1 AND status = 'pending'`,
    [payload.subscriberId],
  );
  if (!sub) return;

  const token = await signToken(payload.subscriberId, "confirm");
  const confirmUrl = `${config.baseUrl}/confirm/${token}`;
  await sendSystemEmail(confirmEmail(sub.email, confirmUrl));
}
