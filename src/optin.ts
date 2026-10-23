// Double-opt-in email for one subscriber, in the list's name and brand. Used by the
// form endpoint, the subscriber API and the confirmation reminder.

import { queryOne } from "./db";
import { config } from "./config";
import { signToken } from "./tokens";
import { resolveBrand } from "./brand";
import { sendListEmail } from "./sender";
import { optInEmail } from "./email/templates";

export async function sendOptIn(subscriberId: number, reminder = false): Promise<void> {
  const row = await queryOne<{
    email: string;
    list_name: string | null;
    slug: string;
    owner_account_id: number | null;
  }>(
    `SELECT s.email, g.name AS list_name, g.slug, g.owner_account_id
       FROM subscribers s JOIN groups g ON g.id = s.group_id
      WHERE s.id = $1`,
    [subscriberId],
  );
  if (!row) return;
  const owner = row.owner_account_id ? Number(row.owner_account_id) : null;
  const brand = owner ? await resolveBrand(owner) : null;
  const name = row.list_name || brand?.name || row.slug;
  const token = await signToken(subscriberId, "confirm");
  await sendListEmail(
    owner,
    name,
    optInEmail(
      row.email,
      `${config.baseUrl}/confirm/${token}`,
      { name, color: brand?.color ?? "#F59E0B", logoUrl: brand?.logoUrl ?? "" },
      reminder,
    ),
  );
}
