import { Prisma, type TemplateMetric } from "@prisma/client";
import { prisma } from "../db/prisma";
import type {
  AssignTemplateInput,
  CreateTargetInput,
  OverrideInput,
  SubmitReadingInput,
} from "../schemas/targets.schema";
import { generateApiKey, hashApiKey } from "../utils/api-key";
import { HttpError } from "../utils/http-error";

function evaluateBreach(value: number, condition: string, threshold: number): boolean {
  switch (condition) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold;
    default:
      return false;
  }
}

async function resolveTemplateDefault(
  targetId: number,
  metricId: number
): Promise<TemplateMetric | null> {
  return prisma.templateMetric.findFirst({
    where: { metricId, template: { targetTemplates: { some: { targetId } } } },
    orderBy: { id: "asc" },
  });
}

export async function createTarget(input: CreateTargetInput) {
  const apiKey = generateApiKey();
  const target = await prisma.target.create({
    data: {
      name: input.name,
      type: input.type,
      description: input.description,
      responsibleTeam: input.responsible_team,
      apiKeyHash: hashApiKey(apiKey),
    },
    omit: { apiKeyHash: true },
  });
  return { target, apiKey };
}

export async function assignTemplate(targetId: number, input: AssignTemplateInput) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const template = await prisma.template.findUnique({ where: { id: input.template_id } });
  if (!template) {
    throw new HttpError(404, "template not found");
  }

  try {
    return await prisma.targetTemplate.create({
      data: { targetId, templateId: input.template_id },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "template already assigned to target");
    }
    throw err;
  }
}

export async function unassignTemplate(targetId: number, templateId: number) {
  const result = await prisma.targetTemplate.deleteMany({
    where: { targetId, templateId },
  });
  if (result.count === 0) {
    throw new HttpError(404, "template not assigned to target");
  }
}

export async function setOverride(targetId: number, input: OverrideInput) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const templateDefault = await resolveTemplateDefault(targetId, input.metric_id);
  if (!templateDefault) {
    throw new HttpError(
      422,
      "metric is not reachable via any template assigned to this target"
    );
  }

  return prisma.targetMetricOverride.upsert({
    where: { targetId_metricId: { targetId, metricId: input.metric_id } },
    create: {
      targetId,
      metricId: input.metric_id,
      reportIntervalSec: input.report_interval_sec,
      condition: input.condition,
      threshold: input.threshold,
      consecutiveBreaches: input.consecutive_breaches,
      severity: input.severity,
      responsibleTeam: input.responsible_team,
      alertSubject: input.alert_subject,
      alertDescription: input.alert_description,
      priority: input.priority,
    },
    update: {
      reportIntervalSec: input.report_interval_sec,
      condition: input.condition,
      threshold: input.threshold,
      consecutiveBreaches: input.consecutive_breaches,
      severity: input.severity,
      responsibleTeam: input.responsible_team,
      alertSubject: input.alert_subject,
      alertDescription: input.alert_description,
      priority: input.priority,
    },
  });
}

export async function getEffectiveMetrics(targetId: number) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const templateMetrics = await prisma.templateMetric.findMany({
    where: { template: { targetTemplates: { some: { targetId } } } },
    orderBy: { id: "asc" },
    include: { metric: true },
  });

  const byMetricId = new Map<number, (typeof templateMetrics)[number]>();
  for (const templateMetric of templateMetrics) {
    if (!byMetricId.has(templateMetric.metricId)) {
      byMetricId.set(templateMetric.metricId, templateMetric);
    }
  }

  const overrides = await prisma.targetMetricOverride.findMany({
    where: { targetId, metricId: { in: [...byMetricId.keys()] } },
  });
  const overrideByMetricId = new Map(overrides.map((override) => [override.metricId, override]));

  return [...byMetricId.values()].map((templateMetric) => {
    const override = overrideByMetricId.get(templateMetric.metricId);
    return {
      metric_key: templateMetric.metric.metricKey,
      report_interval_sec: override?.reportIntervalSec ?? templateMetric.reportIntervalSec,
    };
  });
}

export async function submitReading(targetId: number, input: SubmitReadingInput) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const metric = await prisma.metric.findUnique({ where: { metricKey: input.metric_key } });
  if (!metric) {
    throw new HttpError(404, "unknown metric_key");
  }

  const templateDefault = await resolveTemplateDefault(targetId, metric.id);
  if (!templateDefault) {
    throw new HttpError(422, "metric is not assigned to this target via any template");
  }

  const override = await prisma.targetMetricOverride.findUnique({
    where: { targetId_metricId: { targetId, metricId: metric.id } },
  });

  const policy = {
    condition: override?.condition ?? templateDefault.condition,
    threshold: override?.threshold ?? templateDefault.threshold,
    consecutiveBreaches: override?.consecutiveBreaches ?? templateDefault.consecutiveBreaches,
    severity: override?.severity ?? templateDefault.severity,
    responsibleTeam:
      override?.responsibleTeam ?? target.responsibleTeam ?? templateDefault.responsibleTeam,
    alertSubject: override?.alertSubject ?? templateDefault.alertSubject,
    alertDescription: override?.alertDescription ?? templateDefault.alertDescription,
    priority: override?.priority ?? templateDefault.priority,
  };

  const recordedAt = input.recorded_at ? new Date(input.recorded_at) : new Date();

  const reading = await prisma.metricReading.create({
    data: {
      targetId,
      metricId: metric.id,
      value: input.value,
      recordedAt,
    },
  });

  await prisma.target.update({
    where: { id: targetId },
    data: { lastSeenAt: recordedAt, status: "up" },
  });

  if (evaluateBreach(input.value, policy.condition, policy.threshold)) {
    const recentReadings = await prisma.metricReading.findMany({
      where: { targetId, metricId: metric.id },
      orderBy: { recordedAt: "desc" },
      take: policy.consecutiveBreaches,
    });

    const allBreached =
      recentReadings.length === policy.consecutiveBreaches &&
      recentReadings.every((reading) =>
        evaluateBreach(reading.value, policy.condition, policy.threshold)
      );

    if (allBreached && policy.responsibleTeam) {
      const existingOpenAlert = await prisma.alert.findFirst({
        where: { targetId, metricId: metric.id, status: "open" },
      });

      if (!existingOpenAlert) {
        await prisma.alert.create({
          data: {
            targetId,
            metricId: metric.id,
            triggeredValue: input.value,
            severity: policy.severity,
            responsibleTeam: policy.responsibleTeam,
            subject: policy.alertSubject,
            description: policy.alertDescription,
            priority: policy.priority,
          },
        });
      }
    }
  }

  return reading;
}

export async function getMetricHistory(targetId: number, metricId: number, limit: number) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const metric = await prisma.metric.findUnique({ where: { id: metricId } });
  if (!metric) {
    throw new HttpError(404, "metric not found");
  }

  const readings = await prisma.metricReading.findMany({
    where: { targetId, metricId },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });

  return readings.map((reading) => ({ ...reading, id: reading.id.toString() }));
}