import type { TargetMetricOverride, TemplateMetric } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { resolvePolicy } from "../../src/utils/resolve-policy.js";

const templateDefault: TemplateMetric = {
  id: 1,
  templateId: 1,
  metricId: 1,
  reportIntervalSec: 60,
  condition: "gt",
  warningThreshold: 80,
  criticalThreshold: 90,
  consecutiveBreaches: 3,
  responsibleTeam: "template-team",
  alertSubject: "template subject",
  alertDescription: "template description",
  priority: "p3",
};

const override: TargetMetricOverride = {
  id: 1,
  targetId: 1,
  metricId: 1,
  reportIntervalSec: 30,
  condition: "gte",
  warningThreshold: null,
  criticalThreshold: 95,
  consecutiveBreaches: 1,
  responsibleTeam: "override-team",
  alertSubject: "",
  alertDescription: null,
  priority: "p1",
};

describe("resolvePolicy", () => {
  it("uses the template default when nothing is customized", () => {
    expect(resolvePolicy(templateDefault, null, null)).toEqual({
      reportIntervalSec: 60,
      condition: "gt",
      warningThreshold: 80,
      criticalThreshold: 90,
      consecutiveBreaches: 3,
      responsibleTeam: "template-team",
      alertSubject: "template subject",
      alertDescription: "template description",
      priority: "p3",
    });
  });

  it("replaces the whole policy with the override, null thresholds and empty subject included", () => {
    expect(resolvePolicy(templateDefault, override, "target-team")).toEqual({
      reportIntervalSec: 30,
      condition: "gte",
      warningThreshold: null,
      criticalThreshold: 95,
      consecutiveBreaches: 1,
      responsibleTeam: "override-team",
      alertSubject: "",
      alertDescription: null,
      priority: "p1",
    });
  });

  describe("responsible team", () => {
    it("prefers the override's team", () => {
      expect(resolvePolicy(templateDefault, override, "target-team").responsibleTeam).toBe("override-team");
    });

    it("falls back to the target's team when the override has none", () => {
      const noTeam = { ...override, responsibleTeam: null };
      expect(resolvePolicy(templateDefault, noTeam, "target-team").responsibleTeam).toBe("target-team");
    });

    it("falls back to the target's team without an override", () => {
      expect(resolvePolicy(templateDefault, undefined, "target-team").responsibleTeam).toBe("target-team");
    });

    it("falls back to the template's team last, even with an override", () => {
      const noTeam = { ...override, responsibleTeam: null };
      expect(resolvePolicy(templateDefault, noTeam, null).responsibleTeam).toBe("template-team");
    });
  });
});
