import { describe, expect, it } from "vitest";
import { matchesSearch } from "../../app/utils/search";

describe("matchesSearch", () => {
  const fields = ["web-01", null, "Platform", undefined, "cpu.usage"];

  it.each(["", "   "])("matches everything for a blank search (%j)", (search) => {
    expect(matchesSearch(search, fields)).toBe(true);
    expect(matchesSearch(search, [])).toBe(true);
  });

  it("is case-insensitive and matches substrings", () => {
    expect(matchesSearch("PLAT", fields)).toBe(true);
    expect(matchesSearch("cpu.us", fields)).toBe(true);
  });

  it("needs every word, which may come from different fields", () => {
    expect(matchesSearch("web cpu", fields)).toBe(true);
    expect(matchesSearch("web memory", fields)).toBe(false);
  });

  it("ignores null and undefined fields", () => {
    expect(matchesSearch("null", fields)).toBe(false);
    expect(matchesSearch("undefined", fields)).toBe(false);
  });
});
