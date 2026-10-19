import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { CreateMetricInput, UpdateMetricDefaultsInput } from "../schemas/metrics.schema.js";
import { assertValidThresholds } from "../utils/alert-levels.js";
import { HttpError } from "../utils/http-error.js";

export async function createMetric(input: CreateMetricInput) {
  try {
    return await prisma.metric.create({
      data: {
        metricKey: input.metric_key,
        unit: input.unit,
        description: input.description,
        defaultCondition: input.default_condition,
        defaultWarningThreshold: input.default_warning_threshold,
        defaultCriticalThreshold: input.default_critical_threshold,
        defaultPriority: input.default_priority,
        defaultReportIntervalSec: input.default_report_interval_sec,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new HttpError(409, "metric_key already exists");
    }
    throw err;
  }
}

// Forward-only: template metrics already using this metric keep their copies.
export async function updateMetricDefaults(metricId: number, input: UpdateMetricDefaultsInput) {
  const metric = await prisma.metric.findUnique({ where: { id: metricId } });
  if (!metric) {
    throw new HttpError(404, "metric not found");
  }

  // Validate the defaults as they'll be after this change.
  assertValidThresholds(
    input.default_condition ?? metric.defaultCondition ?? "gt",
    input.default_warning_threshold === undefined ? metric.defaultWarningThreshold : input.default_warning_threshold,
    input.default_critical_threshold === undefined ? metric.defaultCriticalThreshold : input.default_critical_threshold
  );

  return prisma.metric.update({
    where: { id: metricId },
    data: {
      defaultCondition: input.default_condition,
      defaultWarningThreshold: input.default_warning_threshold,
      defaultCriticalThreshold: input.default_critical_threshold,
      defaultPriority: input.default_priority,
      defaultAlertSubject: input.default_alert_subject,
    },
  });
}

export function listMetrics() {
  return prisma.metric.findMany({ orderBy: { id: "asc" } });
}