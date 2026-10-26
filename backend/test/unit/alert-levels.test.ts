import { describe, expect, it } from "vitest";
import {
  assertValidThresholds,
  breaches,
  DEFAULT_ALERT_SUBJECT,
  levelOf,
  renderMessage,
  type MessageContext,
} from "../../src/utils/alert-levels.js";
import { HttpError } from "../../src/utils/http-error.js";

describe("breaches", () => {
  it.each([
    ["gt", 90, 90, false],
    ["gt", 90.1, 90, true],
    ["gte", 90, 90, true],
    ["gte", 89.9, 90, false],
    ["lt", 10, 10, false],
    ["lt", 9.9, 10, true],
    ["lte", 10, 10, true],
    ["lte", 10.1, 10, false],
    ["eq", 5, 5, true],
    ["eq", 5.1, 5, false],
  ])("%s: %d against %d is %s", (condition, value, threshold, expected) => {
    expect(breaches(value, condition, threshold)).toBe(expected);
  });

  it("never breaches on an unknown condition", () => {
    expect(breaches(100, "between", 0)).toBe(false);
  });
});

describe("levelOf", () => {
  it("is critical when the critical threshold is crossed, even though warning is too", () => {
    expect(levelOf(95, "gt", 80, 90)).toBe("critical");
  });

  it("is warning between the two thresholds", () => {
    expect(levelOf(85, "gt", 80, 90)).toBe("warning");
  });

  it("is null (healthy) below both thresholds", () => {
    expect(levelOf(50, "gt", 80, 90)).toBeNull();
  });

  it("works with lower-is-worse conditions", () => {
    expect(levelOf(5, "lt", 20, 10)).toBe("critical");
    expect(levelOf(15, "lt", 20, 10)).toBe("warning");
    expect(levelOf(25, "lt", 20, 10)).toBeNull();
  });

  it("skips a missing warning threshold", () => {
    expect(levelOf(85, "gt", null, 90)).toBeNull();
    expect(levelOf(95, "gt", null, 90)).toBe("critical");
  });

  it("skips a missing critical threshold", () => {
    expect(levelOf(99, "gt", 80, null)).toBe("warning");
  });

  it("is always null with both thresholds missing (monitor only)", () => {
    expect(levelOf(1e9, "gt", null, null)).toBeNull();
  });
});

describe("assertValidThresholds", () => {
  function status(fn: () => void) {
    try {
      fn();
    } catch (err) {
      return err instanceof HttpError ? err.status : "other";
    }
    return null;
  }

  it("allows either level to be missing", () => {
    expect(status(() => assertValidThresholds("gt", null, null))).toBeNull();
    expect(status(() => assertValidThresholds("gt", 90, null))).toBeNull();
    expect(status(() => assertValidThresholds("lt", null, 10))).toBeNull();
  });

  it("requires warning below critical for gt and gte", () => {
    expect(status(() => assertValidThresholds("gt", 80, 90))).toBeNull();
    expect(status(() => assertValidThresholds("gt", 90, 90))).toBe(422);
    expect(status(() => assertValidThresholds("gte", 95, 90))).toBe(422);
  });

  it("requires warning above critical for lt and lte", () => {
    expect(status(() => assertValidThresholds("lt", 20, 10))).toBeNull();
    expect(status(() => assertValidThresholds("lt", 10, 10))).toBe(422);
    expect(status(() => assertValidThresholds("lte", 5, 10))).toBe(422);
  });

  it("doesn't order eq thresholds", () => {
    expect(status(() => assertValidThresholds("eq", 10, 5))).toBeNull();
  });
});

describe("renderMessage", () => {
  const context: MessageContext = {
    metric: "cpu_utilization",
    host: "web-1",
    interface: null,
    value: 93.456,
    unit: "%",
    severity: "critical",
    threshold: 90,
  };

  it("fills the default subject, rounding to two decimals", () => {
    expect(renderMessage(DEFAULT_ALERT_SUBJECT, context)).toBe(
      "cpu_utilization on web-1 is 93.46% (critical threshold 90%)"
    );
  });

  it("renders a missing interface and unit as empty", () => {
    expect(renderMessage("[{{interface}}] {{value}}{{unit}}", { ...context, unit: null })).toBe("[] 93.46");
  });

  it("allows spaces inside the braces", () => {
    expect(renderMessage("{{ host }}", context)).toBe("web-1");
  });

  it("leaves unknown placeholders as written", () => {
    expect(renderMessage("{{host}} {{nope}}", context)).toBe("web-1 {{nope}}");
  });
});
