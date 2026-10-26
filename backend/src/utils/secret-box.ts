import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// Encrypts secrets kept in the database (webhook URLs, the SMTP password) so
// a dump or backup alone can't use them. The key is derived from
// BETTER_AUTH_SECRET: changing that secret makes saved values unreadable, and
// they have to be entered again.

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

const key = Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "monli", "notification-secrets", 32));

export class SecretUnreadableError extends Error {
  constructor() {
    super("can't decrypt the saved secret; enter it again (was BETTER_AUTH_SECRET changed?)");
  }
}

// Stored as enc:v1:base64(iv | tag | ciphertext), AES-256-GCM.
export function seal(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function open(stored: string): string {
  if (!stored.startsWith(PREFIX)) throw new SecretUnreadableError();
  const packed = Buffer.from(stored.slice(PREFIX.length), "base64");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, IV_BYTES));
    decipher.setAuthTag(packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(packed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    // GCM authentication fails when the key changed (or the value was altered).
    throw new SecretUnreadableError();
  }
}
