import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import type {
  AddTemplateMetricInput,
  CreateTemplateInput,
} from "../schemas/templates.schema";
import { HttpError } from "../utils/http-error";

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

  try {
    return await prisma.templateMetric.create({
      data: {
        templateId,
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