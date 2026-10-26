import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { setInterfaceMonitored, submitReading, updateTarget } from "../../src/services/targets.service.js";
import { createMetric, createTarget, resetDb, targetWithMetric } from "../helpers/db.js";

// Readings are ordered by recorded_at, so each gets its own minute.
const start = Date.parse("2026-10-01T00:00:00Z");
let minute = 0;
function nextTime() {
  return new Date(start + minute++ * 60_000).toISOString();
}

function submit(targetId: number, value: number, metricKey = "cpu_utilization") {
  return submitReading(targetId, { metric_key: metricKey, value, recorded_at: nextTime() });
}

function submitDevices(targetId: number, devices: { device: string; value: number }[]) {
  return submitReading(targetId, { metric_key: "disk_utilization", devices, recorded_at: nextTime() });
}

function alerts() {
  return prisma.alert.findMany({ orderBy: { id: "asc" } });
}

beforeEach(async () => {
  await resetDb();
  minute = 0;
});

describe("submitReading: opening alerts", () => {
  it("opens an alert on the first breach with consecutive_breaches 1", async () => {
    const { target } = await targetWithMetric({ consecutiveBreaches: 1, responsibleTeam: "ops", priority: "p2" });

    await submit(target.id, 85);

    const [alert] = await alerts();
    expect(alert).toMatchObject({
      status: "open",
      severity: "warning",
      triggeredValue: 85,
      lastValue: 85,
      responsibleTeam: "ops",
      priority: "p2",
      hostName: "web-1",
      interfaceId: null,
      subject: "cpu_utilization on web-1 is 85% (warning threshold 80%)",
    });
  });

  it("waits for consecutive_breaches breaching readings in a row", async () => {
    const { target } = await targetWithMetric({ consecutiveBreaches: 3 });

    await submit(target.id, 85);
    await submit(target.id, 95);
    expect(await alerts()).toHaveLength(0);

    await submit(target.id, 85);
    const [alert] = await alerts();
    // Opens at the level of the reading that completed the streak.
    expect(alert).toMatchObject({ status: "open", severity: "warning", triggeredValue: 85 });
  });

  it("restarts the count after a healthy reading", async () => {
    const { target } = await targetWithMetric({ consecutiveBreaches: 2 });

    await submit(target.id, 85);
    await submit(target.id, 50);
    await submit(target.id, 85);
    expect(await alerts()).toHaveLength(0);

    await submit(target.id, 85);
    expect(await alerts()).toHaveLength(1);
  });

  it("never alerts in monitor-only mode", async () => {
    const { target } = await targetWithMetric({ warningThreshold: null, criticalThreshold: null });

    await submit(target.id, 1000);
    expect(await alerts()).toHaveLength(0);
    expect(await prisma.metricReading.count()).toBe(1);
  });

  it("renders a custom subject and description", async () => {
    const { target } = await targetWithMetric({
      alertSubject: "{{host}} hot: {{value}}",
      alertDescription: "{{severity}} over {{threshold}}{{unit}}",
    });

    await submit(target.id, 95);

    const [alert] = await alerts();
    expect(alert.subject).toBe("web-1 hot: 95");
    expect(alert.description).toBe("critical over 90%");
  });

  it("uses the target's alias as host name when set", async () => {
    const { target } = await targetWithMetric();
    await updateTarget(target.id, { alias: "Web server" });

    await submit(target.id, 95);
    expect((await alerts())[0].hostName).toBe("Web server");
  });
});

describe("submitReading: an open alert", () => {
  it("follows the level of each reading", async () => {
    const { target } = await targetWithMetric();

    await submit(target.id, 85);
    await submit(target.id, 95);
    let [alert] = await alerts();
    expect(alert).toMatchObject({ severity: "critical", triggeredValue: 85, lastValue: 95 });
    expect(alert.subject).toContain("critical threshold 90%");

    await submit(target.id, 82);
    [alert] = await alerts();
    expect(alert).toMatchObject({ status: "open", severity: "warning", lastValue: 82 });
    expect(await alerts()).toHaveLength(1);
  });

  it("resolves on the first healthy reading, and the next breach opens a new one", async () => {
    const { target } = await targetWithMetric({ consecutiveBreaches: 1 });

    await submit(target.id, 95);
    await submit(target.id, 10);
    const [alert] = await alerts();
    expect(alert).toMatchObject({ status: "resolved", lastValue: 10 });
    expect(alert.resolvedAt).not.toBeNull();

    await submit(target.id, 95);
    expect((await alerts()).map((a) => a.status)).toEqual(["resolved", "open"]);
  });

  it("keeps the host name it opened with after an alias change", async () => {
    const { target } = await targetWithMetric();

    await submit(target.id, 85);
    await updateTarget(target.id, { alias: "Renamed" });
    await submit(target.id, 95);

    const [alert] = await alerts();
    expect(alert.hostName).toBe("web-1");
    expect(alert.subject).toContain("on web-1");
  });

  it("marks the target up and stamps last_seen_at", async () => {
    const { target } = await targetWithMetric();

    await submit(target.id, 10);

    const updated = await prisma.target.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.status).toBe("up");
    expect(updated.lastSeenAt?.toISOString()).toBe(new Date(start).toISOString());
  });
});

describe("submitReading: per-interface metrics", () => {
  // Interfaces are recorded concurrently, so ids don't follow device order.
  function interfaceAlerts() {
    return prisma.alert.findMany({ include: { interface: true }, orderBy: { interface: { name: "asc" } } });
  }

  async function diskTarget() {
    return targetWithMetric({}, { metricKey: "disk_utilization", deviceKind: "filesystem" });
  }

  it("creates interfaces and alerts on each one separately", async () => {
    const { target } = await diskTarget();

    await submitDevices(target.id, [
      { device: "/", value: 95 },
      { device: "/data", value: 50 },
    ]);
    await submitDevices(target.id, [
      { device: "/", value: 95 },
      { device: "/data", value: 85 },
    ]);

    const interfaces = await prisma.targetInterface.findMany({ orderBy: { name: "asc" } });
    expect(interfaces.map((i) => i.name)).toEqual(["/", "/data"]);

    const all = await interfaceAlerts();
    expect(all.map((a) => [a.interface?.name, a.severity])).toEqual([
      ["/", "critical"],
      ["/data", "warning"],
    ]);
    expect(all[0].subject).toBe("disk_utilization on web-1 / is 95% (critical threshold 90%)");
  });

  it("resolves one interface's alert without touching another's", async () => {
    const { target } = await diskTarget();

    await submitDevices(target.id, [
      { device: "/", value: 95 },
      { device: "/data", value: 95 },
    ]);
    await submitDevices(target.id, [
      { device: "/", value: 10 },
      { device: "/data", value: 95 },
    ]);

    const all = await interfaceAlerts();
    expect(all.map((a) => [a.interface?.name, a.status])).toEqual([
      ["/", "resolved"],
      ["/data", "open"],
    ]);
  });

  it("drops values for an unmonitored interface", async () => {
    const { target } = await diskTarget();
    await submitDevices(target.id, [{ device: "/", value: 10 }]);
    const root = await prisma.targetInterface.findFirstOrThrow();
    await setInterfaceMonitored(target.id, root.id, { monitored: false }, "Alice");

    const readings = await submitDevices(target.id, [{ device: "/", value: 99 }]);

    expect(readings).toHaveLength(0);
    expect(await prisma.metricReading.count()).toBe(1);
    expect(await alerts()).toHaveLength(0);
  });

  it("resolves an interface's open alerts, with a comment, when its monitoring is turned off", async () => {
    const { target } = await diskTarget();
    await submitDevices(target.id, [{ device: "/", value: 95 }]);
    const root = await prisma.targetInterface.findFirstOrThrow();

    await setInterfaceMonitored(target.id, root.id, { monitored: false }, "Alice");

    const [alert] = await alerts();
    expect(alert.status).toBe("resolved");
    const comments = await prisma.alertComment.findMany();
    expect(comments).toMatchObject([{ alertId: alert.id, action: "resolve", author: "Alice" }]);
  });
});

describe("submitReading: rejected input", () => {
  it("422s a value for a per-device metric", async () => {
    const { target } = await targetWithMetric({}, { metricKey: "disk_utilization", deviceKind: "filesystem" });
    await expect(submit(target.id, 50, "disk_utilization")).rejects.toMatchObject({ status: 422 });
  });

  it("422s devices for a host-wide metric", async () => {
    const { target } = await targetWithMetric();
    await expect(
      submitReading(target.id, { metric_key: "cpu_utilization", devices: [{ device: "/", value: 1 }] })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("422s a metric no assigned template reaches", async () => {
    await createMetric();
    const { target } = await createTarget();
    await expect(submit(target.id, 50)).rejects.toMatchObject({ status: 422 });
  });

  it("404s an unknown metric key", async () => {
    const { target } = await targetWithMetric();
    await expect(submit(target.id, 50, "nope")).rejects.toMatchObject({ status: 404 });
  });
});
