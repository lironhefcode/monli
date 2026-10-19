import { prisma } from "../db/prisma";
import type {
  ListAlertsQuery,
  ResolveAlertInput,
  UpdateAlertInput,
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
    // Names for display; select keeps secrets like target.apiKeyHash out.
    include: {
      target: { select: { id: true, name: true } },
      metric: { select: { id: true, metricKey: true, unit: true } },
    },
  });
}

async function findAlert(alertId: number) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) {
    throw new HttpError(404, "alert not found");
  }
  return alert;
}

// Ack or unack an open alert. author stays null until UI sign-in exists.
export async function updateAlert(alertId: number, input: UpdateAlertInput) {
  const alert = await findAlert(alertId);
  if (alert.status === "resolved") {
    throw new HttpError(409, "alert already resolved");
  }
  if (alert.acknowledged === input.acknowledged) {
    throw new HttpError(409, input.acknowledged ? "alert already acknowledged" : "alert is not acknowledged");
  }

  // The flag and its comment are written together or not at all.
  const [updated] = await prisma.$transaction([
    prisma.alert.update({
      where: { id: alertId },
      data: { acknowledged: input.acknowledged },
    }),
    prisma.alertComment.create({
      data: {
        alertId,
        action: input.acknowledged ? "ack" : "unack",
        body: input.comment ?? null,
      },
    }),
  ]);
  return updated;
}

export async function listAlertComments(alertId: number) {
  await findAlert(alertId);
  return prisma.alertComment.findMany({
    where: { alertId },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolveAlert(alertId: number, input: ResolveAlertInput) {
  const alert = await findAlert(alertId);
  if (alert.status === "resolved") {
    throw new HttpError(409, "alert already resolved");
  }

  const [updated] = await prisma.$transaction([
    prisma.alert.update({
      where: { id: alertId },
      data: { status: "resolved", resolvedAt: new Date() },
    }),
    prisma.alertComment.create({
      data: { alertId, action: "resolve", body: input.note ?? null },
    }),
  ]);
  return updated;
}
