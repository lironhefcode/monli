import { describe, expect, it } from "vitest";
import { formatMetricValue } from "../../app/utils/units";

describe("formatMetricValue", () => {
  it.each([
    [512, "512 B/s"],
    [1536, "1.5 KB/s"],
    [10 * 1024, "10 KB/s"],
    [5.25 * 1024 * 1024, "5.3 MB/s"],
    [3 * 1024 ** 4, "3 TB/s"],
    [2048 * 1024 ** 4, "2048 TB/s"],
    [-1536, "-1.5 KB/s"],
  ])("B/s: %d → %s", (value, expected) => {
    expect(formatMetricValue(value, "B/s")).toBe(expected);
  });

  it.each([
    [42.4, "42s"],
    [125, "2m"],
    [3 * 3600 + 25 * 60, "3h 25m"],
    [2 * 86400 + 5 * 3600 + 59, "2d 5h"],
  ])("seconds: %d → %s", (value, expected) => {
    expect(formatMetricValue(value, "s")).toBe(expected);
  });

  it("formats percentages to one decimal", () => {
    expect(formatMetricValue(93.456, "%")).toBe("93.5%");
    expect(formatMetricValue(50, "%")).toBe("50%");
  });

  it("appends other units, rounding large values to whole numbers", () => {
    expect(formatMetricValue(1.2345, "errors/s")).toBe("1.23 errors/s");
    expect(formatMetricValue(1234.56, "pages/s")).toBe("1235 pages/s");
  });

  it("shows only the number without a unit", () => {
    expect(formatMetricValue(0.756, null)).toBe("0.76");
    expect(formatMetricValue(312, null)).toBe("312");
  });
});
