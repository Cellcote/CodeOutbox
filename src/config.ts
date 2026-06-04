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
    transport: (env.EMAIL_TRANSPORT?.trim() || "console") as "console" | "smtp",
    from: env.MAIL_FROM?.trim() || "CodeOutbox <hello@codeoutbox.dev>",
    smtpUrl: env.SMTP_URL?.trim() || "",
  },
};

export type Config = typeof config;
