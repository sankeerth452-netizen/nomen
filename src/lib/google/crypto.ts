// Google refresh tokens are stored encrypted (AES-256-GCM). The key is GOOGLE_TOKEN_KEY, or one derived from
// AUTH_SECRET when that isn't set (changing AUTH_SECRET then means brands connect Google again).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { authSecret } from "../env";

function key(): Buffer {
  const k = process.env.GOOGLE_TOKEN_KEY?.trim();
  if (k) {
    const b = Buffer.from(k, "base64");
    if (b.length !== 32) throw new Error("GOOGLE_TOKEN_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
    return b;
  }
  return createHash("sha256").update(`nomen-google-token:${authSecret()}`).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
