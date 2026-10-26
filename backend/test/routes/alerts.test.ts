import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { submitReading } from "../../src/services/targets.service.js";
import { signedInAs } from "../helpers/auth.js";
import { resetDb, targetWithMetric } from "../helpers/db.js";

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
  it("lists alerts filtered by status, without the target's key hash", async () => {
    const open = await request(app).get("/alerts?status=open").set("Cookie", cookie);
    expect(open.status).toBe(200);
    expect(open.body).toHaveLength(1);
    expect(open.body[0].target).toEqual({ id: expect.any(Number), name: "web-1" });

    const resolved = await request(app).get("/alerts?status=resolved").set("Cookie", cookie);
    expect(resolved.body).toHaveLength(0);
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
