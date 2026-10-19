import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type {
  AddTemplateMetricInput,
  CreateTemplateInput,
  UpdateTemplateMetricInput,
} from "../schemas/templates.schema.js";
import { assertValidThresholds } from "../utils/alert-levels.js";
import { HttpError } from "../utils/http-error.js";

export function listTemplates() {
  return prisma.template.findMany({
    select: { id: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
}

// GET /templates/:id — the template, its metrics with policies, and how many
// targets inherit from it (so the UI can say who an edit affects).
export async function getTemplateDetail(templateId: number) {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      templateMetrics: {
        include: { metric: { select: { id: true, metricKey: true, unit: true } } },
        orderBy: { id: "asc" },
      },
      _count: { select: { targetTemplates: true } },
    },
  });
  if (!template) {
    throw new HttpError(404, "template not found");
  }

  const { templateMetrics, _count, ...rest } = template;
  return { ...rest, targetCount: _count.targetTemplates, metrics: templateMetrics };
}

export async function updateTemplateMetric(
  templateId: number,
  metricId: number,
  input: UpdateTemplateMetricInput
) {
  const existing = await prisma.templateMetric.findUnique({
    where: { templateId_metricId: { templateId, metricId } },
  });
  if (!existing) {
    throw new HttpError(404, "metric is not in this template");
  }
  // Validate the merged result, since a patch may change only one side.
  assertValidThresholds(
    input.condition ?? existing.condition,
    input.warning_threshold !== undefined ? input.warning_threshold : existing.warningThreshold,
    input.critical_threshold !== undefined ? input.critical_threshold : existing.criticalThreshold
  );

  try {
    return await prisma.templateMetric.update({
      where: { templateId_metricId: { templateId, metricId } },
      data: {
        reportIntervalSec: input.report_interval_sec,
        condition: input.condition,
        warningThreshold: input.warning_threshold,
        criticalThreshold: input.critical_threshold,
        consecutiveBreaches: input.consecutive_breaches,
        responsibleTeam: input.responsible_team,
        alertSubject: input.alert_subject,
        alertDescription: input.alert_description,
        priority: input.priority,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new HttpError(404, "metric is not in this template");
    }
    throw err;
  }
}

export async function removeTemplateMetric(templateId: number, metricId: number) {
  const result = await prisma.templateMetric.deleteMany({ where: { templateId, metricId } });
  if (result.count === 0) {
    throw new HttpError(404, "metric is not in this template");
  }
}

export function createTemplate(input: CreateTemplateInput) {
  return prisma.template.create({
    data: {
      name: input.name,
      description: input.description,
    },
  });
}

export async function addTemplateMetric(
  templateId: number,
  input: AddTemplateMetricInput
) {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });
  if (!template) {
    throw new HttpError(404, "template not found");
  }

  const metric = await prisma.metric.findUnique({
    where: { id: input.metric_id },
  });
  if (!metric) {
    throw new HttpError(404, "metric not found");
  }

  assertValidThresholds(input.condition, input.warning_threshold, input.critical_threshold);

  try {
    return await prisma.templateMetric.create({
      data: {
        templateId,
        metricId: input.metric_id,
        reportIntervalSec: input.report_interval_sec,
        condition: input.condition,
        warningThreshold: input.warning_threshold,
        criticalThreshold: input.critical_threshold,
        consecutiveBreaches: input.consecutive_breaches,
        responsibleTeam: input.responsible_team,
        alertSubject: input.alert_subject,
        alertDescription: input.alert_description,
        priority: input.priority,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new HttpError(409, "metric already added to template");
    }
    throw err;
  }
}