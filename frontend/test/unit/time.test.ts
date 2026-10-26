import { describe, expect, it } from "vitest";
import { formatAgo } from "../../app/utils/time";
import { displayName } from "../../app/utils/targets";

const now = Date.parse("2026-10-27T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);

describe("formatAgo", () => {
  it.each([
    [0, "just now"],
    [0.9, "just now"],
    [1, "1 min ago"],
    [59, "59 min ago"],
    [60, "1 h ago"],
    [23 * 60 + 59, "23 h ago"],
    [24 * 60, "1 d ago"],
    [10 * 24 * 60, "10 d ago"],
  ])("%d minutes → %s", (minutes, expected) => {
    expect(formatAgo(minutesAgo(minutes), now)).toBe(expected);
  });

  it("accepts ISO strings", () => {
    expect(formatAgo(minutesAgo(5).toISOString(), now)).toBe("5 min ago");
  });

  it("shows a time in the future (clock skew) as just now", () => {
    expect(formatAgo(minutesAgo(-10), now)).toBe("just now");
  });
});

describe("displayName", () => {
  it("prefers the alias", () => {
    expect(displayName({ name: "web-1", alias: "Web server" })).toBe("Web server");
    expect(displayName({ name: "web-1", alias: null })).toBe("web-1");
  });
});
