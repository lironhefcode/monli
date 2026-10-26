import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createEnrollmentToken } from "../../src/services/agents.service.js";
import { assignTemplate, createMetric, createTemplate, resetDb } from "../helpers/db.js";

const app = createApp();
const agent = { hostname: "web-1", os: "linux", arch: "x86_64" };

beforeEach(resetDb);

async function register() {
  const { token } = await createEnrollmentToken("linux");
  return request(app).post("/agents/register").set("X-Enrollment-Token", token).send(agent);
}

describe("POST /agents/register", () => {
  it("401s without an enrollment token", async () => {
    const res = await request(app).post("/agents/register").send(agent);
    expect(res.status).toBe(401);
  });

  it("401s with an unknown token", async () => {
    const res = await request(app).post("/agents/register").set("X-Enrollment-Token", "nope").send(agent);
    expect(res.status).toBe(401);
  });

  it("400s without a hostname", async () => {
    const { token } = await createEnrollmentToken("linux");
    const res = await request(app).post("/agents/register").set("X-Enrollment-Token", token).send({});
    expect(res.status).toBe(400);
  });

  it("binds the target to the request's source IP, without the IPv4-mapped prefix", async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.target.ipAddress).toMatch(/^(127\.0\.0\.1|::1)$/);
    expect(res.body.serverUrl).toBe("http://localhost:3000");
  });

  it("re-binds the same host on re-install", async () => {
    const first = await register();
    const second = await register();

    expect(second.body.target.id).toBe(first.body.target.id);
    expect(await prisma.target.count()).toBe(1);
  });
});

describe("agent API key", () => {
  it("authenticates the agent's poll and reading submits, and only the latest key works", async () => {
    const metric = await createMetric();
    const template = await createTemplate("Linux", [
      { metricId: metric.id, condition: "gt", warningThreshold: 80, reportIntervalSec: 30 },
    ]);
    const first = await register();
    const { target, apiKey } = first.body;
    await assignTemplate(target.id, template.id);

    const poll = await request(app).get(`/targets/${target.id}/poll`).set("X-Api-Key", apiKey);
    expect(poll.status).toBe(200);
    expect(poll.body).toEqual({
      metrics: [{ metric_key: "cpu_utilization", report_interval_sec: 30 }],
      check_now: [],
    });

    const submit = await request(app)
      .post(`/targets/${target.id}/metrics`)
      .set("X-Api-Key", apiKey)
      .send({ metric_key: "cpu_utilization", value: 42 });
    expect(submit.status).toBe(201);
    expect(submit.body[0]).toMatchObject({ value: 42, id: expect.any(String) });

    // A re-install rotates the key; the old one stops working.
    const second = await register();
    const stale = await request(app).get(`/targets/${target.id}/poll`).set("X-Api-Key", apiKey);
    expect(stale.status).toBe(401);
    const fresh = await request(app).get(`/targets/${target.id}/poll`).set("X-Api-Key", second.body.apiKey);
    expect(fresh.status).toBe(200);
  });

  it("401s a missing key, and another target's key", async () => {
    const a = (await register()).body;
    const { token } = await createEnrollmentToken("linux");
    const b = (
      await request(app).post("/agents/register").set("X-Enrollment-Token", token).send({ hostname: "web-2" })
    ).body;

    expect((await request(app).get(`/targets/${a.target.id}/poll`)).status).toBe(401);
    expect((await request(app).get(`/targets/${a.target.id}/poll`).set("X-Api-Key", b.apiKey)).status).toBe(401);
  });
});
