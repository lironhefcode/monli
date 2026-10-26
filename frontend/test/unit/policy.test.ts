import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALERT_SUBJECT,
  DEFAULT_INTERFACE_ALERT_SUBJECT,
} from "../../../backend/src/utils/alert-levels";
import {
  apiErrorMessage,
  defaultAlertSubject,
  formatLevels,
  formatRule,
  thresholdProblem,
  toThreshold,
} from "../../app/utils/policy";

describe("formatRule", () => {
  it("joins symbol, threshold and unit", () => {
    expect(formatRule("gt", 90, "%")).toBe("> 90 %");
    expect(formatRule("lte", 1.5, null)).toBe("≤ 1.5");
  });
});

describe("formatLevels", () => {
  it("lists the levels that are on, warning first", () => {
    expect(formatLevels("gt", 80, 90, "%")).toEqual([
      { level: "warning", rule: "> 80 %" },
      { level: "critical", rule: "> 90 %" },
    ]);
  });

  it("skips a level that is off", () => {
    expect(formatLevels("lt", null, 10, null)).toEqual([{ level: "critical", rule: "< 10" }]);
  });

  it("is empty for monitor only", () => {
    expect(formatLevels("gt", null, null, "%")).toEqual([]);
  });
});

describe("thresholdProblem", () => {
  it("asks for a number when a level is on but empty", () => {
    expect(thresholdProblem("gt", true, null, false, null)).toBe("Enter a warning threshold.");
    expect(thresholdProblem("gt", false, null, true, null)).toBe("Enter a critical threshold.");
  });

  it("accepts monitor only and a single level", () => {
    expect(thresholdProblem("gt", false, null, false, null)).toBeNull();
    expect(thresholdProblem("gt", true, 90, false, null)).toBeNull();
  });

  // Same rule as assertValidThresholds in backend/src/utils/alert-levels.ts.
  it.each([
    ["gt", 80, 90, null],
    ["gt", 90, 90, "Warning must be lower than critical."],
    ["gte", 95, 90, "Warning must be lower than critical."],
    ["lt", 20, 10, null],
    ["lt", 10, 10, "Warning must be higher than critical."],
    ["lte", 5, 10, "Warning must be higher than critical."],
    ["eq", 10, 5, null],
  ] as const)("%s with warning %d and critical %d → %s", (condition, warning, critical, expected) => {
    expect(thresholdProblem(condition, true, warning, true, critical)).toBe(expected);
  });
});

describe("toThreshold", () => {
  it("turns an empty input into null and keeps numbers", () => {
    expect(toThreshold("")).toBeNull();
    expect(toThreshold(NaN)).toBeNull();
    expect(toThreshold(0)).toBe(0);
    expect(toThreshold(42.5)).toBe(42.5);
  });
});

describe("defaultAlertSubject", () => {
  it("matches the backend's default subjects", () => {
    expect(defaultAlertSubject(null)).toBe(DEFAULT_ALERT_SUBJECT);
    expect(defaultAlertSubject("filesystem")).toBe(DEFAULT_INTERFACE_ALERT_SUBJECT);
  });
});

describe("apiErrorMessage", () => {
  it("uses the API's error message", () => {
    expect(apiErrorMessage({ data: { error: "alert already resolved" } })).toBe("alert already resolved");
  });

  it("falls back when the response has none", () => {
    expect(apiErrorMessage(new Error("network"))).toBe("Could not reach the server");
    expect(apiErrorMessage({ data: {} }, "Save failed")).toBe("Save failed");
  });
});
