import type { Prisma } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { submitReading } from "../../src/services/targets.service.js";
import { signedInAs } from "../helpers/auth.js";
import { createTarget, resetDb, targetWithMetric } from "../helpers/db.js";

const app = createApp();
let cookie: string;
let alertId: number;

beforeEach(async () => {
  await resetDb();
  ({ cookie } = await signedInAs("editor", "Alice"));
  const { target } = await targetWithMetric();
  await submitReading(target.id, { metric_key: "cpu_utilization", value: 95 });
  alertId = (await prisma.alert.findFirstOrThrow()).id;
});

function comments() {
  return prisma.alertComment.findMany({ where: { alertId }, orderBy: { id: "asc" } });
}

describe("PATCH /alerts/:id", () => {
  it("acks and unacks, recording each as a comment by the signed-in user", async () => {
    const ack = await request(app)
      .patch(`/alerts/${alertId}`)
      .set("Cookie", cookie)
      .send({ acknowledged: true, comment: "looking" });
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledged).toBe(true);

    const unack = await request(app).patch(`/alerts/${alertId}`).set("Cookie", cookie).send({ acknowledged: false });
    expect(unack.status).toBe(200);
    expect(unack.body.acknowledged).toBe(false);

    expect(await comments()).toMatchObject([
      { action: "ack", body: "looking", author: "Alice" },
      { action: "unack", body: null, author: "Alice" },
    ]);
  });

  it("409s acking an acknowledged alert", async () => {
    await request(app).patch(`/alerts/${alertId}`).set("Cookie", cookie).send({ acknowledged: true });
    const res = await request(app).patch(`/alerts/${alertId}`).set("Cookie", cookie).send({ acknowledged: true });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "alert already acknowledged" });
    expect(await comments()).toHaveLength(1);
  });

  it("409s unacking an alert that isn't acknowledged", async () => {
    const res = await request(app).patch(`/alerts/${alertId}`).set("Cookie", cookie).send({ acknowledged: false });
    expect(res.status).toBe(409);
  });

  it("409s on a resolved alert", async () => {
    await request(app).post(`/alerts/${alertId}/resolve`).set("Cookie", cookie).send({});
    const res = await request(app).patch(`/alerts/${alertId}`).set("Cookie", cookie).send({ acknowledged: true });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "alert already resolved" });
  });

  it("404s an unknown alert", async () => {
    const res = await request(app).patch("/alerts/999").set("Cookie", cookie).send({ acknowledged: true });
    expect(res.status).toBe(404);
  });

  it("400s an invalid body", async () => {
    const res = await request(app).patch(`/alerts/${alertId}`).set("Cookie", cookie).send({ acknowledged: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("POST /alerts/:id/resolve", () => {
  it("resolves the alert with a comment holding the note", async () => {
    const res = await request(app).post(`/alerts/${alertId}/resolve`).set("Cookie", cookie).send({ note: "fixed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("resolved");
    expect(res.body.resolvedAt).not.toBeNull();
    expect(await comments()).toMatchObject([{ action: "resolve", body: "fixed", author: "Alice" }]);
  });

  it("409s on an already resolved alert, without another comment", async () => {
    await request(app).post(`/alerts/${alertId}/resolve`).set("Cookie", cookie).send({});
    const res = await request(app).post(`/alerts/${alertId}/resolve`).set("Cookie", cookie).send({});

    expect(res.status).toBe(409);
    expect(await comments()).toHaveLength(1);
  });
});

describe("GET /alerts", () => {
  // Alerts on the beforeEach target and metric, opened `daysAgo` days back.
  async function addAlert(daysAgo: number, data: Partial<Prisma.AlertUncheckedCreateInput> = {}) {
    const { targetId, metricId } = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    return prisma.alert.create({
      data: {
        targetId,
        metricId,
        triggeredValue: 95,
        severity: "warning",
        priority: "p3",
        hostName: "web-1",
        subject: "High CPU",
        openedAt: new Date(Date.now() - daysAgo * 86_400_000),
        ...data,
      },
    });
  }

  function list(query = "") {
    return request(app).get(`/alerts${query}`).set("Cookie", cookie);
  }

  it("lists alerts filtered by status, without the target's key hash", async () => {
    const open = await list("?status=open");
    expect(open.status).toBe(200);
    expect(open.body.alerts).toHaveLength(1);
    expect(open.body.alerts[0].target).toEqual({ id: expect.any(Number), name: "web-1" });

    const resolved = await list("?status=resolved");
    expect(resolved.body.alerts).toHaveLength(0);
  });

  it("counts each tab under the same filters, whatever the status asked for", async () => {
    await addAlert(1, { acknowledged: true });
    await addAlert(2, { status: "resolved", resolvedAt: new Date() });
    await addAlert(3, { status: "resolved", resolvedAt: new Date(), acknowledged: true });
    await addAlert(4, { status: "resolved", resolvedAt: new Date(), priority: "p1" });

    const res = await list("?status=open&acknowledged=false");
    expect(res.body.total).toBe(1);
    expect(res.body.counts).toEqual({ open: 1, acknowledged: 1, resolved: 3 });

    const acked = await list("?status=open&acknowledged=true");
    expect(acked.body.alerts).toHaveLength(1);
    expect(acked.body.alerts[0].acknowledged).toBe(true);

    const p1 = await list("?status=resolved&priority=p1");
    expect(p1.body.total).toBe(1);
    expect(p1.body.counts).toEqual({ open: 0, acknowledged: 0, resolved: 1 });
  });

  it("filters by any of several teams and priorities", async () => {
    // The beforeEach alert is p3 with no team.
    await addAlert(1, { responsibleTeam: "Ops", priority: "p1" });
    await addAlert(2, { responsibleTeam: "Data", priority: "p2" });
    await addAlert(3, { responsibleTeam: "Web", priority: "p1" });

    const teams = await list("?team=Ops&team=Data");
    expect(teams.body.alerts.map((alert: { responsibleTeam: string }) => alert.responsibleTeam)).toEqual([
      "Ops",
      "Data",
    ]);

    const oneTeam = await list("?team=Web");
    expect(oneTeam.body.total).toBe(1);

    const priorities = await list("?priority=p1&priority=p3");
    expect(priorities.body.total).toBe(3);

    const both = await list("?team=Ops&team=Data&priority=p2");
    expect(both.body.alerts.map((alert: { responsibleTeam: string }) => alert.responsibleTeam)).toEqual(["Data"]);

    const invalid = await list("?priority=p1&priority=p9");
    expect(invalid.status).toBe(400);
  });

  it("pages newest first with limit and offset", async () => {
    for (let day = 1; day <= 4; day++) {
      await addAlert(day, { status: "resolved", resolvedAt: new Date(), subject: `day ${day}` });
    }

    const first = await list("?status=resolved&limit=3");
    expect(first.body.total).toBe(4);
    expect(first.body.alerts.map((alert: { subject: string }) => alert.subject)).toEqual(["day 1", "day 2", "day 3"]);

    const second = await list("?status=resolved&limit=3&offset=3");
    expect(second.body.alerts.map((alert: { subject: string }) => alert.subject)).toEqual(["day 4"]);
  });

  it("searches every word across host, subject and metric, ignoring case", async () => {
    await addAlert(1, { hostName: "db-1", subject: "Disk almost full" });

    const both = await list("?q=DB-1%20disk");
    expect(both.body.alerts.map((alert: { hostName: string }) => alert.hostName)).toEqual(["db-1"]);

    const metric = await list("?q=cpu_util");
    expect(metric.body.total).toBe(2);

    const none = await list("?q=db-1%20web-1");
    expect(none.body.total).toBe(0);
  });

  it("filters by opened time, severity and resource", async () => {
    // The beforeEach reading (95) is critical.
    await addAlert(10, { severity: "warning" });

    const recent = await list(`?from=${new Date(Date.now() - 5 * 86_400_000).toISOString()}`);
    expect(recent.body.alerts.map((alert: { severity: string }) => alert.severity)).toEqual(["critical"]);

    const old = await list(`?to=${new Date(Date.now() - 5 * 86_400_000).toISOString()}`);
    expect(old.body.alerts.map((alert: { severity: string }) => alert.severity)).toEqual(["warning"]);

    const warning = await list("?severity=warning");
    expect(warning.body.total).toBe(1);

    const other = await createTarget("web-2");
    const otherTarget = await list(`?targetId=${other.target.id}`);
    expect(otherTarget.body.total).toBe(0);
  });

  it("400s a limit over 100", async () => {
    const res = await list("?limit=101");
    expect(res.status).toBe(400);
  });
});

describe("GET /alerts/teams", () => {
  it("lists team names in use", async () => {
    await createTarget("web-2", "Ops");
    const res = await request(app).get("/alerts/teams").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(["Ops"]);
  });
});

describe("GET /alerts/:id/comments", () => {
  it("lists the history oldest first", async () => {
    await request(app).patch(`/alerts/${alertId}`).set("Cookie", cookie).send({ acknowledged: true });
    await request(app).post(`/alerts/${alertId}/resolve`).set("Cookie", cookie).send({});

    const res = await request(app).get(`/alerts/${alertId}/comments`).set("Cookie", cookie);
    expect(res.body.map((comment: { action: string }) => comment.action)).toEqual(["ack", "resolve"]);
  });
});
