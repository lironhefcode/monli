import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { markStaleTargetsDown } from "../../src/jobs/target-status.job.js";
import { listMetrics } from "../../src/services/metrics.service.js";
import { submitReading, updateTarget } from "../../src/services/targets.service.js";
import { addTemplateMetric } from "../../src/services/templates.service.js";
import { ensureHostUpMetric } from "../../src/services/host-down.service.js";
import { resetDb, targetWithMetric } from "../helpers/db.js";

const start = Date.parse("2026-10-01T00:00:00Z");
const minutes = (n: number) => new Date(start + n * 60_000);

function submitAt(targetId: number, minute: number, value = 10) {
  return submitReading(targetId, { metric_key: "cpu_utilization", value, recorded_at: minutes(minute).toISOString() });
}

function hostDownAlerts() {
  return prisma.alert.findMany({ where: { metric: { metricKey: "host_up" } }, orderBy: { id: "asc" } });
}

async function status(targetId: number) {
  return (await prisma.target.findUniqueOrThrow({ where: { id: targetId } })).status;
}

beforeEach(async () => {
  await resetDb();
});

describe("markStaleTargetsDown", () => {
  it("leaves a target that reported recently up", async () => {
    const { target } = await targetWithMetric();
    await submitAt(target.id, 0);

    await markStaleTargetsDown(minutes(2));

    expect(await status(target.id)).toBe("up");
    expect(await hostDownAlerts()).toHaveLength(0);
  });

  it("marks a silent target down and opens one critical p1 alert for its team", async () => {
    const { target } = await targetWithMetric({ responsibleTeam: "ops" });
    await updateTarget(target.id, { alias: "Web server", responsible_team: "infra" });
    await submitAt(target.id, 0);

    await markStaleTargetsDown(minutes(4));

    expect(await status(target.id)).toBe("down");
    const [alert] = await hostDownAlerts();
    expect(alert).toMatchObject({
      status: "open",
      severity: "critical",
      priority: "p1",
      responsibleTeam: "infra",
      hostName: "Web server",
      interfaceId: null,
      subject: "Web server is down",
      description: `No reading since ${minutes(0).toISOString()}`,
    });
  });

  it("never opens a second alert for a target that is already down", async () => {
    const { target } = await targetWithMetric();
    await submitAt(target.id, 0);

    await markStaleTargetsDown(minutes(4));
    await markStaleTargetsDown(minutes(5));
    // Even if the status is flipped back without a reading.
    await prisma.target.update({ where: { id: target.id }, data: { status: "up" } });
    await markStaleTargetsDown(minutes(6));

    expect(await hostDownAlerts()).toHaveLength(1);
  });

  it("waits three of the target's longest report intervals", async () => {
    const { target } = await targetWithMetric({ reportIntervalSec: 600 });
    await submitAt(target.id, 0);

    await markStaleTargetsDown(minutes(5));
    expect(await status(target.id)).toBe("up");

    await markStaleTargetsDown(minutes(31));
    expect(await status(target.id)).toBe("down");
    expect(await hostDownAlerts()).toHaveLength(1);
  });
});

describe("a reading after the host went down", () => {
  it("sets the target up and resolves the alert; the next outage opens a new one", async () => {
    const { target } = await targetWithMetric();
    await submitAt(target.id, 0);
    await markStaleTargetsDown(minutes(4));

    await submitAt(target.id, 5);

    expect(await status(target.id)).toBe("up");
    const [alert] = await hostDownAlerts();
    expect(alert).toMatchObject({ status: "resolved", lastValue: 1, resolvedAt: minutes(5) });

    await markStaleTargetsDown(minutes(9));
    expect((await hostDownAlerts()).map((a) => a.status)).toEqual(["resolved", "open"]);
  });

  it("leaves metric alerts alone", async () => {
    const { target } = await targetWithMetric();
    await submitAt(target.id, 0, 95);
    await markStaleTargetsDown(minutes(4));

    await submitAt(target.id, 5, 95);

    const metricAlert = await prisma.alert.findFirstOrThrow({ where: { metric: { metricKey: "cpu_utilization" } } });
    expect(metricAlert.status).toBe("open");
  });
});

describe("the built-in host_up metric", () => {
  it("is kept out of the catalog and templates", async () => {
    const { template } = await targetWithMetric();
    const hostUp = await ensureHostUpMetric();

    expect((await listMetrics()).map((m) => m.metricKey)).toEqual(["cpu_utilization"]);
    await expect(
      addTemplateMetric(template.id, {
        metric_id: hostUp.id,
        report_interval_sec: 60,
        condition: "lt",
        warning_threshold: null,
        critical_threshold: null,
        consecutive_breaches: 1,
        alert_subject: "",
        priority: "p3",
      })
    ).rejects.toMatchObject({ status: 422 });
  });
});
