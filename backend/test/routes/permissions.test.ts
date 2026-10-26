import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import type { Role } from "../../src/auth/permissions.js";
import { prisma } from "../../src/db/prisma.js";
import { submitReading } from "../../src/services/targets.service.js";
import { signedInAs } from "../helpers/auth.js";
import { resetDb, targetWithMetric } from "../helpers/db.js";

const app = createApp();

let targetId: number;
let metricId: number;
let alertId: number;

beforeEach(async () => {
  await resetDb();
  const { target, metric } = await targetWithMetric();
  targetId = target.id;
  metricId = metric.id;
  await submitReading(target.id, { metric_key: "cpu_utilization", value: 95 });
  alertId = (await prisma.alert.findFirstOrThrow()).id;
});

type Call = (cookie?: string) => request.Test;

function withCookie(test: request.Test, cookie?: string) {
  return cookie ? test.set("Cookie", cookie) : test;
}

// Any signed-in role may read these.
const reads: [string, Call][] = [
  ["GET /alerts", (cookie) => withCookie(request(app).get("/alerts"), cookie)],
  ["GET /targets", (cookie) => withCookie(request(app).get("/targets"), cookie)],
  ["GET /targets/:id", (cookie) => withCookie(request(app).get(`/targets/${targetId}`), cookie)],
  ["GET /templates", (cookie) => withCookie(request(app).get("/templates"), cookie)],
];

// Each needs the edit permission (editor or admin).
const edits: [string, Call, number][] = [
  [
    "PATCH /alerts/:id",
    (cookie) => withCookie(request(app).patch(`/alerts/${alertId}`), cookie).send({ acknowledged: true }),
    200,
  ],
  [
    "POST /agents/enrollment-tokens",
    (cookie) => withCookie(request(app).post("/agents/enrollment-tokens"), cookie).send({ os: "linux" }),
    201,
  ],
  [
    "PUT /targets/:id/overrides/:metricId",
    (cookie) =>
      withCookie(request(app).put(`/targets/${targetId}/overrides/${metricId}`), cookie).send({
        report_interval_sec: 60,
        condition: "gt",
        warning_threshold: 70,
        critical_threshold: 95,
        consecutive_breaches: 1,
        responsible_team: null,
        alert_subject: "",
        alert_description: null,
        priority: "p2",
      }),
    200,
  ],
  [
    "PATCH /targets/:id",
    (cookie) => withCookie(request(app).patch(`/targets/${targetId}`), cookie).send({ alias: "Web" }),
    200,
  ],
];

describe("signed out", () => {
  it.each([...reads, ...edits.map(([name, call]) => [name, call] as [string, Call])])("%s → 401", async (_, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "not signed in" });
  });

  it("rejects a forged session cookie", async () => {
    const res = await request(app).get("/alerts").set("Cookie", "better-auth.session_token=forged");
    expect(res.status).toBe(401);
  });
});

describe.each<Role>(["viewer", "editor", "admin"])("%s", (role) => {
  it.each(reads)("can %s", async (_, call) => {
    const { cookie } = await signedInAs(role);
    expect((await call(cookie)).status).toBe(200);
  });

  const canEdit = role !== "viewer";
  it.each(edits)(`${canEdit ? "can" : "can't"} %s`, async (_, call, okStatus) => {
    const { cookie } = await signedInAs(role);
    const res = await call(cookie);
    if (canEdit) {
      expect(res.status).toBe(okStatus);
    } else {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "requires the edit permission" });
    }
  });
});

describe("user management (Better Auth admin endpoints)", () => {
  it.each<[Role, boolean]>([
    ["viewer", false],
    ["editor", false],
    ["admin", true],
  ])("%s listing users: allowed %s", async (role, allowed) => {
    const { cookie } = await signedInAs(role);
    const res = await request(app).get("/user/admin/list-users").set("Cookie", cookie);
    if (allowed) {
      expect(res.status).toBe(200);
    } else {
      // Not any 4xx: a 404 from a broken route must not pass as a denial.
      expect([401, 403]).toContain(res.status);
    }
  });

  it("lets an admin change another user's role", async () => {
    const { cookie } = await signedInAs("admin");
    const { user } = await signedInAs("viewer");

    const res = await request(app)
      .post("/user/admin/set-role")
      .set("Cookie", cookie)
      .send({ userId: user.id, role: "editor" });

    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("editor");
  });

  it("refuses an admin changing their own role", async () => {
    const { cookie, user } = await signedInAs("admin");

    const res = await request(app)
      .post("/user/admin/set-role")
      .set("Cookie", cookie)
      .send({ userId: user.id, role: "viewer" });

    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("admin");
  });
});
