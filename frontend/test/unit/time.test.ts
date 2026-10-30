import { describe, expect, it } from "vitest";
import { formatAgo, formatDuration } from "../../app/utils/time";
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

describe("formatDuration", () => {
  const start = new Date(now);
  const after = (seconds: number) => new Date(now + seconds * 1000);

  it.each([
    [0, "0 s"],
    [45, "45 s"],
    [60, "1 min"],
    [12 * 60 + 30, "12 min"],
    [3600, "1 h"],
    [3 * 3600 + 5 * 60, "3 h 5 min"],
    [86_400, "1 d"],
    [2 * 86_400 + 4 * 3600 + 59 * 60, "2 d 4 h"],
  ])("%d seconds → %s", (seconds, expected) => {
    expect(formatDuration(start, after(seconds))).toBe(expected);
  });

  it("accepts ISO strings and never goes negative", () => {
    expect(formatDuration(start.toISOString(), after(90).toISOString())).toBe("1 min");
    expect(formatDuration(after(90), start)).toBe("0 s");
  });
});

describe("displayName", () => {
  it("prefers the alias", () => {
    expect(displayName({ name: "web-1", alias: "Web server" })).toBe("Web server");
    expect(displayName({ name: "web-1", alias: null })).toBe("web-1");
  });
});
