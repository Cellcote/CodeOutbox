// Central 12-factor config. Everything has a local-dev default.

const env = process.env;

const databaseUrl = env.DATABASE_URL?.trim() || "";

// Driver selection: explicit DB_DRIVER wins; otherwise pg when a URL is present,
// else fall back to embedded PGlite (zero external services).
const dbDriver = (env.DB_DRIVER?.trim() ||
  (databaseUrl ? "pg" : "pglite")) as "pg" | "pglite";

export const config = {
  port: Number(env.PORT ?? 3000),
  baseUrl: (env.BASE_URL?.trim() || "http://localhost:3000").replace(/\/$/, ""),
  tokenSecret: env.TOKEN_SECRET?.trim() || "dev-secret-change-me",

  db: {
    driver: dbDriver,
    url: databaseUrl,
    pgliteDir: env.PGLITE_DIR?.trim() || "./.data/pglite",
  },

  email: {
    transport: (env.EMAIL_TRANSPORT?.trim() || "console") as
      | "console"
      | "smtp"
      | "stream",
    from: env.MAIL_FROM?.trim() || "CodeOutbox <noreply@mail.codeoutbox.com>",
    smtpUrl: env.SMTP_URL?.trim() || "",
  },

  send: {
    // Delay between messages in a broadcast fan-out (ms). 0 = no throttle.
    throttleMs: Number(env.SEND_THROTTLE_MS ?? 0),
    // Above this recipient count, a verified sending domain is required.
    freeTierLimit: Number(env.FREE_TIER_SEND_LIMIT ?? 100),
    // VERP bounce return-path domain + shared secret for the MTA's bounce pipe.
    bounceDomain: env.BOUNCE_DOMAIN?.trim() || "bounce.codeoutbox.com",
    bounceSecret: env.BOUNCE_WEBHOOK_SECRET ?? "",
  },

  domains: {
    // 'dns' = real TXT lookups; 'mock' = assume the records are published
    // (local/dev only, so the add→verify→unlock flow is demonstrable offline).
    verifyMode: (env.DOMAIN_VERIFY_MODE?.trim() || "dns") as "dns" | "mock",
    spfInclude: env.SPF_INCLUDE?.trim() || "spf.codeoutbox.com",
    dmarcRua: env.DMARC_RUA?.trim() || "dmarc@codeoutbox.com",
  },

  // Shared sending identity (the default From for tenants who haven't verified a
  // domain). We own this domain's SPF/DKIM/DMARC. The private key signs shared mail.
  shared: {
    domain: env.SHARED_FROM_DOMAIN?.trim() || "mail.codeoutbox.com",
    dkimSelector: env.SHARED_DKIM_SELECTOR?.trim() || "co",
    // Accepts a PEM directly, a PEM with literal \n, or base64-encoded PEM
    // (single-line, docker-env-friendly).
    dkimPrivateKey: readPem(env.SHARED_DKIM_PRIVATE_KEY),
  },
};

function readPem(v?: string): string {
  if (!v) return "";
  if (v.includes("BEGIN")) return v.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(v, "base64").toString("utf8");
    return decoded.includes("BEGIN") ? decoded : v;
  } catch {
    return v;
  }
}

export type Config = typeof config;
