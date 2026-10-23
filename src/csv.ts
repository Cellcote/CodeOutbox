// CSV for subscriber import: a small RFC 4180 parser plus header mapping that
// understands the exports of the usual suspects (Mailchimp, Kit, Substack,
// Buttondown, Beehiiv) so `co subscribers import list export.csv` just works.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, ""); // Excel BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// Export metadata that isn't useful as a merge field.
const IGNORE = new Set([
  "id", "leid", "euid", "created", "created_at", "subscribed_at", "subscription_date",
  "optin_time", "optin_ip", "confirm_time", "confirm_ip", "latitude", "longitude",
  "gmtoff", "dstoff", "timezone", "cc", "region", "last_changed", "member_rating",
  "notes", "source", "tags", "email_disabled",
]);

const INACTIVE = /unsub|clean|bounce|complain|inactive|cancel|spam/i;

function headerKey(h: string): string {
  const t = h.trim().toLowerCase();
  if (/^(e-?mail( address)?|subscriber e-?mail|email_address)$/.test(t)) return "email";
  if (/^(name|full[ _]?name)$/.test(t)) return "name";
  if (/^(first[ _]?name|fname|given[ _]name)$/.test(t)) return "first_name";
  if (/^(last[ _]?name|lname|surname|family[ _]name)$/.test(t)) return "last_name";
  if (/^(status|state|subscription[ _]status)$/.test(t)) return "status";
  const slug = t.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(slug) ? slug : slug ? `f_${slug}`.slice(0, 40) : "";
}

export interface ImportRow {
  email: string;
  name?: string;
  [field: string]: string | undefined;
}

export interface MappedCsv {
  rows: ImportRow[];
  inactive: number; // rows skipped because their status says unsubscribed/bounced/…
  columns: string[]; // mapped column keys actually imported
}

export function csvToSubscribers(text: string): MappedCsv {
  const [header, ...data] = parseCsv(text);
  if (!header) return { rows: [], inactive: 0, columns: [] };
  const keys = header.map(headerKey);
  if (!keys.includes("email")) {
    // Headerless list of addresses.
    if (header.length === 1 && header[0].includes("@")) {
      return {
        rows: [header, ...data].map((r) => ({ email: r[0].trim() })),
        inactive: 0,
        columns: ["email"],
      };
    }
    throw new Error(`no email column found in header: ${header.join(", ")}`);
  }

  const rows: ImportRow[] = [];
  let inactive = 0;
  for (const cells of data) {
    const row: ImportRow = { email: "" };
    let status = "";
    keys.forEach((k, i) => {
      const v = (cells[i] ?? "").trim();
      if (!k || !v || IGNORE.has(k)) return;
      if (k === "status") status = v;
      else row[k] = v;
    });
    if (status && INACTIVE.test(status)) {
      inactive++;
      continue;
    }
    if (!row.name && (row.first_name || row.last_name)) {
      row.name = [row.first_name, row.last_name].filter(Boolean).join(" ");
    }
    rows.push(row);
  }
  const columns = [...new Set(keys.filter((k) => k && k !== "status" && !IGNORE.has(k)))];
  return { rows, inactive, columns };
}
