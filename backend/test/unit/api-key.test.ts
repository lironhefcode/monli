import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, verifyApiKey } from "../../src/utils/api-key.js";

describe("api keys", () => {
  it("verifies a key against its own hash", () => {
    const key = generateApiKey();
    expect(verifyApiKey(key, hashApiKey(key))).toBe(true);
  });

  it("rejects a different key", () => {
    expect(verifyApiKey(generateApiKey(), hashApiKey(generateApiKey()))).toBe(false);
  });

  it("rejects a malformed hash instead of throwing", () => {
    expect(verifyApiKey(generateApiKey(), "not-hex")).toBe(false);
  });

  it("generates a different key each time", () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});
