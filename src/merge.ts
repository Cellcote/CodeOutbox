// Merge tags + custom subscriber fields.
//
//   {{first_name}}  {{name}}  {{email}}  {{company}}  {{fields.company}}
//   {{first_name | "there"}}   ← fallback when the subscriber has no value
//
// Tags are applied per recipient AFTER Markdown rendering, so subscriber-supplied
// values (anyone can type into a signup form) are inserted as escaped text and can
// never inject HTML or Markdown. Inside links, marked URL-encodes the braces; those
// tags get a URL-encoded value instead.

import type { RenderedCampaign } from "./campaign";
import { escapeAttr } from "./email/shell";

export type Fields = Record<string, string>;

export interface MergeSubscriber {
  email: string;
  name?: string | null;
  fields?: Record<string, unknown> | null;
}

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const RESERVED = new Set(["email", "name", "status", "fields"]);
const MAX_FIELDS = 25;
const MAX_VALUE = 500;

// Normalize arbitrary input (form body, API JSON, CSV row) into storable fields:
// simple keys, scalar values as trimmed strings, bounded in count and size.
export function cleanFields(input: unknown): Fields {
  const out: Fields = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_FIELDS) break;
    if (!KEY_RE.test(k) || RESERVED.has(k)) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    const s = String(v).trim().slice(0, MAX_VALUE);
    if (s) out[k] = s;
  }
  return out;
}

// The values a recipient's tags resolve against. Custom fields can supply
// first_name/last_name; otherwise they're derived from `name`.
export function mergeVars(s: MergeSubscriber): Fields {
  const fields = cleanFields(s.fields);
  const name = (s.name ?? "").trim();
  const [first = "", ...rest] = name ? name.split(/\s+/) : [];
  return {
    first_name: first,
    last_name: rest.join(" "),
    ...fields,
    name,
    email: s.email,
  };
}

const TAG = /\{\{\s*([\w.-]+)\s*(?:\|\s*(.*?)\s*)?\}\}/g;
const URL_TAG = /%7B%7B(?:%20)*([\w.-]+)(?:%20)*(?:%7C(.*?))?%7D%7D/gi;

const keyOf = (k: string) => (k.startsWith("fields.") ? k.slice(7) : k);

function unquote(s: string | undefined): string | undefined {
  if (s == null) return undefined;
  const t = s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  const m = /^(["'])(.*)\1$/.exec(t);
  return m ? m[2] : t;
}

export interface MergeOptions {
  // Value for a tag with no data and no fallback (default: empty string).
  missing?: (key: string) => string;
}

function resolve(vars: Fields, key: string, fallback: string | undefined, o: MergeOptions) {
  const v = vars[keyOf(key)];
  if (v) return v;
  if (fallback != null) return fallback;
  return o.missing ? o.missing(keyOf(key)) : "";
}

export function mergeText(s: string, vars: Fields, o: MergeOptions = {}): string {
  return s.replace(TAG, (_, k, fb) => resolve(vars, k, unquote(fb), o));
}

export function mergeHtml(s: string, vars: Fields, o: MergeOptions = {}): string {
  return s
    .replace(URL_TAG, (_, k, fb) => {
      let f: string | undefined;
      try {
        f = fb == null ? undefined : unquote(decodeURIComponent(fb));
      } catch {
        f = unquote(fb);
      }
      return encodeURIComponent(resolve(vars, k, f, o));
    })
    .replace(TAG, (_, k, fb) => escapeAttr(resolve(vars, k, unquote(fb), o)));
}

export function personalize(
  r: RenderedCampaign,
  vars: Fields,
  o: MergeOptions = {},
): RenderedCampaign {
  const oneLine = (s: string) => mergeText(s, vars, o).replace(/[\r\n]+/g, " ");
  return {
    meta: {
      ...r.meta,
      subject: oneLine(r.meta.subject),
      preheader: r.meta.preheader != null ? oneLine(r.meta.preheader) : undefined,
    },
    bodyText: mergeText(r.bodyText, vars, o),
    bodyHtml: mergeHtml(r.bodyHtml, vars, o),
  };
}

export interface TagUse {
  key: string;
  hasFallback: boolean;
}

// Every distinct tag in the subject/preheader/body (the raw Markdown covers links).
export function tagsUsed(r: RenderedCampaign): TagUse[] {
  const seen = new Map<string, boolean>();
  const src = [r.meta.subject, r.meta.preheader ?? "", r.bodyText].join("\n");
  for (const m of src.matchAll(TAG)) {
    const key = keyOf(m[1]);
    seen.set(key, (seen.get(key) ?? false) || m[2] != null);
  }
  return [...seen].map(([key, hasFallback]) => ({ key, hasFallback }));
}

// Preview data: a sample person, and visible [key] markers for custom fields so
// the author sees where data lands. Never a real subscriber (previews can be shared).
export const SAMPLE_VARS: Fields = {
  email: "ada@example.com",
  name: "Ada Lovelace",
  first_name: "Ada",
  last_name: "Lovelace",
};
export const SAMPLE_MISSING = (key: string) => `[${key}]`;
