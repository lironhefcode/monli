import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/db/prisma.js";
import { createTarget as createTargetService } from "../../src/services/targets.service.js";
import { assertTestDatabase } from "./test-database.js";

const tables = [
  "alert_comments",
  "alerts",
  "metric_readings",
  "target_interfaces",
  "target_metric_overrides",
  "target_templates",
  "enrollment_tokens",
  "targets",
  "template_metrics",
  "templates",
  "metrics",
  "sessions",
  "accounts",
  "verifications",
  "users",
];

// Empties every table and restarts ids, for a clean slate per test.
export async function resetDb() {
  assertTestDatabase(process.env.DATABASE_URL);
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
}

export function createMetric(data: Partial<Prisma.MetricCreateInput> = {}) {
  return prisma.metric.create({ data: { metricKey: "cpu_utilization", unit: "%", ...data } });
}

type TemplatePolicy = Omit<Prisma.TemplateMetricUncheckedCreateInput, "templateId">;

// A template holding the given metrics, each with its policy.
export async function createTemplate(name: string, metrics: TemplatePolicy[]) {
  return prisma.template.create({
    data: { name, templateMetrics: { create: metrics } },
    include: { templateMetrics: { orderBy: { id: "asc" } } },
  });
}

// Through the service, so the target has a real API key.
export async function createTarget(name = "web-1", responsibleTeam?: string) {
  return createTargetService({ name, type: "host", responsible_team: responsibleTeam });
}

export function assignTemplate(targetId: number, templateId: number) {
  return prisma.targetTemplate.create({ data: { targetId, templateId } });
}

// A target with one metric assigned through one template, the common setup
// for reading and alert tests.
export async function targetWithMetric(
  policy: Partial<TemplatePolicy> = {},
  metric: Partial<Prisma.MetricCreateInput> = {}
) {
  const createdMetric = await createMetric(metric);
  const template = await createTemplate("Linux", [
    { metricId: createdMetric.id, condition: "gt", warningThreshold: 80, criticalThreshold: 90, ...policy },
  ]);
  const { target, apiKey } = await createTarget();
  await assignTemplate(target.id, template.id);
  return { target, apiKey, metric: createdMetric, template };
}
