import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import {
  getTargetDetail,
  resolveTemplateDefault,
  setOverride,
  updateTarget,
} from "../../src/services/targets.service.js";
import { assignTemplate, createMetric, createTarget, createTemplate, resetDb } from "../helpers/db.js";

const overrideInput = {
  report_interval_sec: 30,
  condition: "gt" as const,
  warning_threshold: null,
  critical_threshold: 99,
  consecutive_breaches: 2,
  responsible_team: null,
  alert_subject: "",
  alert_description: null,
  priority: "p1" as const,
};

beforeEach(resetDb);

describe("resolveTemplateDefault", () => {
  it("picks the lowest template_metrics.id when two assigned templates share the metric", async () => {
    const metric = await createMetric();
    const first = await createTemplate("First", [{ metricId: metric.id, condition: "gt", warningThreshold: 70 }]);
    const second = await createTemplate("Second", [{ metricId: metric.id, condition: "gt", warningThreshold: 50 }]);
    const { target } = await createTarget();
    // Assigned in reverse order: assignment order must not matter.
    await assignTemplate(target.id, second.id);
    await assignTemplate(target.id, first.id);

    const resolved = await resolveTemplateDefault(target.id, metric.id);
    expect(resolved?.id).toBe(first.templateMetrics[0].id);
    expect(resolved?.warningThreshold).toBe(70);
  });

  it("ignores templates that aren't assigned to the target", async () => {
    const metric = await createMetric();
    await createTemplate("Unassigned", [{ metricId: metric.id, condition: "gt" }]);
    const { target } = await createTarget();

    expect(await resolveTemplateDefault(target.id, metric.id)).toBeNull();
  });
});

describe("getTargetDetail", () => {
  it("lists each metric once, from the winning template", async () => {
    const metric = await createMetric();
    const first = await createTemplate("First", [{ metricId: metric.id, condition: "gt", warningThreshold: 70 }]);
    const second = await createTemplate("Second", [{ metricId: metric.id, condition: "gt", warningThreshold: 50 }]);
    const { target } = await createTarget();
    await assignTemplate(target.id, first.id);
    await assignTemplate(target.id, second.id);

    const detail = await getTargetDetail(target.id);
    expect(detail.metrics).toHaveLength(1);
    expect(detail.metrics[0]).toMatchObject({ source: { name: "First" }, warningThreshold: 70, overridden: false });
    expect(detail).not.toHaveProperty("apiKeyHash");
  });

  it("shows an override's policy, with the team falling back to the target's", async () => {
    const metric = await createMetric();
    const template = await createTemplate("Linux", [
      { metricId: metric.id, condition: "gt", warningThreshold: 80, criticalThreshold: 90, responsibleTeam: "ops" },
    ]);
    const { target } = await createTarget("web-1", "web-team");
    await assignTemplate(target.id, template.id);
    await setOverride(target.id, metric.id, overrideInput);

    const [resolved] = (await getTargetDetail(target.id)).metrics;
    expect(resolved).toMatchObject({
      overridden: true,
      customTeam: null,
      responsibleTeam: "web-team",
      warningThreshold: null,
      criticalThreshold: 99,
      reportIntervalSec: 30,
      priority: "p1",
    });
  });

  it("uses the template's team when neither the override nor the target has one", async () => {
    const metric = await createMetric();
    const template = await createTemplate("Linux", [{ metricId: metric.id, condition: "gt", responsibleTeam: "ops" }]);
    const { target } = await createTarget();
    await assignTemplate(target.id, template.id);

    expect((await getTargetDetail(target.id)).metrics[0].responsibleTeam).toBe("ops");

    await updateTarget(target.id, { responsible_team: "web-team" });
    expect((await getTargetDetail(target.id)).metrics[0].responsibleTeam).toBe("web-team");

    await setOverride(target.id, metric.id, { ...overrideInput, responsible_team: "dba" });
    expect((await getTargetDetail(target.id)).metrics[0]).toMatchObject({ responsibleTeam: "dba", customTeam: "dba" });
  });

  it("404s on an unknown target", async () => {
    await expect(getTargetDetail(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe("setOverride", () => {
  it("refuses a metric no assigned template reaches", async () => {
    const metric = await createMetric();
    const { target } = await createTarget();

    await expect(setOverride(target.id, metric.id, overrideInput)).rejects.toMatchObject({ status: 422 });
  });

  it("refuses warning above critical", async () => {
    const metric = await createMetric();
    const template = await createTemplate("Linux", [{ metricId: metric.id, condition: "gt" }]);
    const { target } = await createTarget();
    await assignTemplate(target.id, template.id);

    await expect(
      setOverride(target.id, metric.id, { ...overrideInput, warning_threshold: 95, critical_threshold: 90 })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("updates in place when set twice", async () => {
    const metric = await createMetric();
    const template = await createTemplate("Linux", [{ metricId: metric.id, condition: "gt" }]);
    const { target } = await createTarget();
    await assignTemplate(target.id, template.id);

    await setOverride(target.id, metric.id, overrideInput);
    await setOverride(target.id, metric.id, { ...overrideInput, priority: "p2" });

    const overrides = await prisma.targetMetricOverride.findMany();
    expect(overrides).toHaveLength(1);
    expect(overrides[0].priority).toBe("p2");
  });
});
