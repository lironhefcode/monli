import { prisma } from "../db/prisma";
import type {
  FirstResponseInput,
  ListAlertsQuery,
} from "../schemas/alerts.schema";
import { HttpError } from "../utils/http-error";

export function listAlerts(query: ListAlertsQuery) {
  return prisma.alert.findMany({
    where: {
      status: query.status,
      responsibleTeam: query.team,
      priority: query.priority,
    },
    orderBy: { openedAt: "desc" },
  });
}

export async function recordFirstResponse(
  alertId: number,
  input: FirstResponseInput,
) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) {
    throw new HttpError(404, "alert not found");
  }
  if (alert.firstResponseAt) {
    throw new HttpError(409, "alert already has a first response");
  }

  return prisma.alert.update({
    where: { id: alertId },
    data: {
      firstResponseAt: new Date(),
      firstResponseBy: input.by,
      firstResponseNote: input.note,
    },
  });
}

export async function resolveAlert(alertId: number) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) {
    throw new HttpError(404, "alert not found");
  }
  if (alert.status === "resolved") {
    throw new HttpError(409, "alert already resolved");
  }

  return prisma.alert.update({
    where: { id: alertId },
    data: { status: "resolved", resolvedAt: new Date() },
  });
}
