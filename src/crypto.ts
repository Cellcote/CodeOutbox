// Symmetric encryption for secrets at rest (DKIM private keys, later: tenant SMTP).
// AES-256-GCM with a key derived from TOKEN_SECRET. Format: iv:tag:ciphertext (base64).

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { config } from "./config";

const key = scryptSync(config.tokenSecret, "codeoutbox-enc-v1", 32);

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

export function decrypt(blob: string): string {
  const [ivB, tagB, ctB] = blob.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
