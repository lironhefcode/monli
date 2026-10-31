import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type {
  ListAlertsQuery,
  ResolveAlertInput,
  UpdateAlertInput,
} from "../schemas/alerts.schema.js";
import { HttpError } from "../utils/http-error.js";
import { notifyAlert } from "./notifications.service.js";

// Every word must appear in at least one field, like the UI's matchesSearch.
function searchWhere(search: string | undefined): Prisma.AlertWhereInput[] {
  const words = search?.split(/\s+/).filter(Boolean) ?? [];
  return words.map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return {
      OR: [
        { hostName: contains },
        { subject: contains },
        { description: contains },
        { responsibleTeam: contains },
        { metric: { metricKey: contains } },
        { interface: { name: contains } },
      ],
    };
  });
}

// One page of alerts, newest first, plus how many match the filters in each
// tab (open, acknowledged, resolved) so the UI can label its tabs.
export async function listAlerts(query: ListAlertsQuery) {
  const baseWhere: Prisma.AlertWhereInput = {
    responsibleTeam: query.team && { in: query.team },
    priority: query.priority && { in: query.priority },
    severity: query.severity,
    targetId: query.targetId,
    openedAt: { gte: query.from, lte: query.to },
    AND: searchWhere(query.q),
  };
  const where: Prisma.AlertWhereInput = {
    ...baseWhere,
    status: query.status,
    acknowledged: query.acknowledged,
  };

  const [alerts, total, groups] = await prisma.$transaction([
    prisma.alert.findMany({
      where,
      // id breaks ties so pages don't skip or repeat alerts.
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      skip: query.offset,
      take: query.limit,
      // Names for display; select keeps secrets like target.apiKeyHash out.
      include: {
        target: { select: { id: true, name: true } },
        metric: { select: { id: true, metricKey: true, unit: true } },
        interface: { select: { id: true, kind: true, name: true } },
      },
    }),
    prisma.alert.count({ where }),
    prisma.alert.groupBy({
      by: ["status", "acknowledged"],
      where: baseWhere,
      orderBy: [{ status: "asc" }, { acknowledged: "asc" }],
      _count: { _all: true },
    }),
  ]);

  const counts = { open: 0, acknowledged: 0, resolved: 0 };
  for (const group of groups) {
    const count = (group._count as { _all: number })._all;
    if (group.status === "resolved") counts.resolved += count;
    else if (group.acknowledged) counts.acknowledged += count;
    else counts.open += count;
  }
  return { alerts, total, counts };
}

async function findAlert(alertId: number) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) {
    throw new HttpError(404, "alert not found");
  }
  return alert;
}

// Ack or unack an open alert. author is the signed-in user's name at the time.
export async function updateAlert(alertId: number, input: UpdateAlertInput, author: string) {
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
        author,
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

export async function resolveAlert(alertId: number, input: ResolveAlertInput, author: string) {
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
      data: { alertId, action: "resolve", body: input.note ?? null, author },
    }),
  ]);
  notifyAlert("resolved", alertId, { by: author, note: input.note ?? null });
  return updated;
}
