import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateApiKey(): string {
  return randomBytes(24).toString("base64url");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function verifyApiKey(key: string, hash: string): boolean {
  const candidate = Buffer.from(hashApiKey(key), "hex");
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}