import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanFields,
  mergeVars,
  mergeText,
  mergeHtml,
  personalize,
  tagsUsed,
} from "../src/merge.ts";
import { parseCampaign } from "../src/campaign.ts";
import { csvToSubscribers, parseCsv } from "../src/csv.ts";

const vars = mergeVars({
  email: "ada@ex.com",
  name: "Ada King Lovelace",
  fields: { company: "Analytical & Co", plan: "pro" },
});

test("mergeVars derives first/last name and exposes fields", () => {
  assert.equal(vars.first_name, "Ada");
  assert.equal(vars.last_name, "King Lovelace");
  assert.equal(vars.company, "Analytical & Co");
  // a custom field can't spoof the real address
  assert.equal(mergeVars({ email: "a@x", fields: { email: "evil@x" } }).email, "a@x");
});

test("text: tags, fields. prefix, quoted and bare fallbacks", () => {
  assert.equal(mergeText("Hi {{first_name}} at {{fields.company}}", vars), "Hi Ada at Analytical & Co");
  assert.equal(mergeText('Hi {{ nick | "there" }}', vars), "Hi there");
  assert.equal(mergeText("Hi {{nick|friend}}", vars), "Hi friend");
  assert.equal(mergeText("Hi {{nick}}!", vars), "Hi !");
});

test("html: values are escaped — subscriber input can't inject markup", () => {
  const evil = mergeVars({ email: "x@ex.com", name: '<img src=x onerror=alert(1)> "q"' });
  const out = mergeHtml("<p>Hi {{name}}</p>", evil);
  assert.ok(!out.includes("<img"));
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt; &quot;q&quot;/);
});

test("html: tags inside rendered links get URL-encoded values", () => {
  const r = parseCampaign(
    '---\nsubject: Hi {{first_name | "you"}}\ngroup: g\n---\n' +
      'Hello {{first_name}} from {{company}}.\n\n[go](https://x.com/?e={{email}}&c={{company}})\n',
  );
  const p = personalize(r, vars);
  assert.equal(p.meta.subject, "Hi Ada");
  assert.match(p.bodyHtml, /Hello Ada from Analytical &amp; Co\./);
  assert.match(p.bodyHtml, /href="https:\/\/x\.com\/\?e=ada%40ex\.com&c=Analytical%20%26%20Co"/);
  assert.match(p.bodyText, /Hello Ada from Analytical & Co\./);
  assert.ok(!/\{\{|%7B%7B/i.test(p.bodyHtml + p.bodyText));
});

test("subject can't be split into extra header lines", () => {
  const r = parseCampaign("---\nsubject: Hi {{name}}\ngroup: g\n---\nbody text here\n");
  const p = personalize(r, mergeVars({ email: "a@x", name: "A\r\nBcc: victim@x" }));
  assert.ok(!/[\r\n]/.test(p.meta.subject));
});

test("tagsUsed reports keys and whether a fallback exists", () => {
  const r = parseCampaign('---\nsubject: Hi {{first_name | "you"}}\ngroup: g\n---\n{{company}} {{fields.company}}\n');
  assert.deepEqual(tagsUsed(r), [
    { key: "first_name", hasFallback: true },
    { key: "company", hasFallback: false },
  ]);
});

test("cleanFields keeps simple scalar fields, drops junk", () => {
  assert.deepEqual(
    cleanFields({ company: " Acme ", "bad key": "x", email: "e", n: 3, obj: { a: 1 }, empty: "" }),
    { company: "Acme", n: "3" },
  );
});

test("CSV parser handles quotes, commas, newlines and BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n'), [
    ["a", "b"],
    ["x, y", 'say "hi"\nthere'],
  ]);
});

test("Mailchimp-style export maps headers and leaves out unsubscribed rows", () => {
  const csv =
    "Email Address,First Name,Last Name,Company,MEMBER_RATING,OPTIN_TIME,Status\n" +
    "a@ex.com,Ada,Lovelace,Acme,4,2024-01-01,subscribed\n" +
    "b@ex.com,Bob,,,2,2024-01-01,unsubscribed\n" +
    "c@ex.com,,,,1,,cleaned\n";
  const m = csvToSubscribers(csv);
  assert.equal(m.inactive, 2);
  assert.deepEqual(m.rows, [
    { email: "a@ex.com", first_name: "Ada", last_name: "Lovelace", company: "Acme", name: "Ada Lovelace" },
  ]);
  assert.deepEqual(m.columns, ["email", "first_name", "last_name", "company"]);
});

test("headerless list of addresses imports as emails", () => {
  assert.deepEqual(csvToSubscribers("a@ex.com\nb@ex.com\n").rows, [
    { email: "a@ex.com" },
    { email: "b@ex.com" },
  ]);
});

test("Kit export: location 'State' isn't mistaken for subscription status", () => {
  const csv =
    "First name,Email address,Status,City,State,Country\n" +
    "Ada,a@ex.com,active,Austin,Texas,US\n" +
    "Bo,b@ex.com,cancelled,Reno,Nevada,US\n";
  const m = csvToSubscribers(csv);
  assert.equal(m.inactive, 1);
  assert.deepEqual(m.rows.map((r) => r.email), ["a@ex.com"]);
  assert.equal(m.rows[0].state, "Texas", "kept as a field");
});

test("Buttondown export: subscriber_type filters out unsubscribed and unactivated", () => {
  const csv =
    "id,email,notes,subscriber_type,tags\n" +
    "1,a@ex.com,,regular,\n2,b@ex.com,,unsubscribed,\n3,c@ex.com,,unactivated,\n";
  const m = csvToSubscribers(csv);
  assert.deepEqual(m.rows.map((r) => r.email), ["a@ex.com"]);
  assert.equal(m.inactive, 2);
});

test("unusual email header still found", () => {
  assert.deepEqual(csvToSubscribers("Subscriber Email Address,email_disabled\nz@ex.com,false\n").rows.map((r) => r.email), ["z@ex.com"]);
});
