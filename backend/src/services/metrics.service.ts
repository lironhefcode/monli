import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import type { CreateMetricInput } from "../schemas/metrics.schema";
import { HttpError } from "../utils/http-error";

export async function createMetric(input: CreateMetricInput) {
  try {
    return await prisma.metric.create({
      data: {
        metricKey: input.metric_key,
        unit: input.unit,
        description: input.description,
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

export function listMetrics() {
  return prisma.metric.findMany({ orderBy: { id: "asc" } });
}