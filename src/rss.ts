// RSS-to-email: poll a feed per list and auto-broadcast new posts. First poll
// just records the latest item (no history blast); later polls send what's new.

import { query, queryOne } from "./db";
import { enqueue } from "./queue";
import { reportError } from "./errors";
import { sendBroadcast } from "./broadcast";

const POLL_INTERVAL_MIN = 30;

export interface RssConfig {
  url: string;
  lastGuid: string | null;
}

export async function getRss(
  accountId: number,
  slug: string,
): Promise<RssConfig | null> {
  const row = await queryOne<{ rss_url: string | null; rss_last_guid: string | null }>(
    `SELECT rss_url, rss_last_guid FROM groups WHERE slug = $1 AND owner_account_id = $2`,
    [slug, accountId],
  );
  if (!row || !row.rss_url) return null;
  return { url: row.rss_url, lastGuid: row.rss_last_guid };
}

export async function setRss(
  accountId: number,
  slug: string,
  url: string,
): Promise<boolean> {
  // Reset lastGuid on (re)set so the first poll seeds rather than blasts history.
  const row = await queryOne<{ id: number }>(
    `UPDATE groups SET rss_url = $3, rss_last_guid = NULL
      WHERE slug = $1 AND owner_account_id = $2 RETURNING id`,
    [slug, accountId, url],
  );
  return !!row;
}

export async function clearRss(accountId: number, slug: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `UPDATE groups SET rss_url = NULL, rss_last_guid = NULL
      WHERE slug = $1 AND owner_account_id = $2 RETURNING id`,
    [slug, accountId],
  );
  return !!row;
}

// --- minimal RSS 2.0 / Atom parser (no deps) ---

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  content: string;
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const b of blocks) {
    const title = tag(b, "title");
    let link = tag(b, "link");
    if (!link) {
      const lm = b.match(/<link[^>]*href="([^"]+)"/i); // Atom <link href="..."/>
      link = lm ? lm[1] : "";
    }
    const guid = tag(b, "guid") || tag(b, "id") || link;
    const content =
      tag(b, "content:encoded") ||
      tag(b, "content") ||
      tag(b, "description") ||
      tag(b, "summary");
    if (title || link) items.push({ guid, title, link, content });
  }
  return items;
}

export async function runRssPoll(): Promise<void> {
  try {
    const groups = await query<{
      id: number;
      slug: string;
      owner_account_id: number;
      rss_url: string;
      rss_last_guid: string | null;
    }>(
      `SELECT id, slug, owner_account_id, rss_url, rss_last_guid FROM groups
        WHERE rss_url IS NOT NULL AND rss_url <> '' AND owner_account_id IS NOT NULL`,
    );
    for (const g of groups) {
      try {
        const res = await fetch(g.rss_url, {
          headers: { "user-agent": "CodeOutbox-RSS/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) continue;
        const items = parseFeed(await res.text());
        if (!items.length) continue;

        // First poll: seed the cursor, don't blast existing posts.
        if (!g.rss_last_guid) {
          await query(`UPDATE groups SET rss_last_guid = $2 WHERE id = $1`, [
            g.id,
            items[0].guid,
          ]);
          continue;
        }

        // Collect items newer than the cursor (feeds are newest-first).
        const fresh: FeedItem[] = [];
        for (const it of items) {
          if (it.guid && it.guid === g.rss_last_guid) break;
          fresh.push(it);
        }
        if (!fresh.length) continue;

        const newestGuid = fresh[0].guid;
        for (const it of fresh.reverse()) {
          const subject = it.title.replace(/[\r\n]+/g, " ").replace(/"/g, "'");
          const body = `${it.content}\n\n[Read the full post →](${it.link})`;
          const source = `---\nsubject: "${subject}"\ngroup: ${g.slug}\n---\n${body}`;
          try {
            await sendBroadcast(source, g.owner_account_id);
          } catch (err) {
            reportError("rss broadcast", err);
          }
        }
        await query(`UPDATE groups SET rss_last_guid = $2 WHERE id = $1`, [
          g.id,
          newestGuid,
        ]);
      } catch (err) {
        reportError("rss poll group", err);
      }
    }
  } catch (err) {
    reportError("rss poll", err);
  } finally {
    await enqueue("rss.poll", {}, new Date(Date.now() + POLL_INTERVAL_MIN * 60_000));
  }
}
