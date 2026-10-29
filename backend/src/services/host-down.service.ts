import { prisma } from "../db/prisma.js";
import { notifyAlert } from "./notifications.service.js";

// Built-in metric host-down alerts open against, so they fit the
// (target, metric, interface) alert model. Kept out of the catalog: it can't
// be listed, created or added to a template, so agents never report it.
export const HOST_UP_METRIC_KEY = "host_up";

// Created on first use rather than seeded, so every install has it.
export function ensureHostUpMetric() {
  return prisma.metric.upsert({
    where: { metricKey: HOST_UP_METRIC_KEY },
    create: { metricKey: HOST_UP_METRIC_KEY, description: "Agent is reporting (1) or not (0)" },
    update: {},
  });
}

type DownTarget = {
  id: number;
  name: string;
  alias: string | null;
  responsibleTeam: string | null;
  lastSeenAt: Date | null;
};

// At most one open host-down alert per target.
export async function openHostDownAlert(target: DownTarget, now: Date) {
  const metric = await ensureHostUpMetric();
  const existing = await prisma.alert.findFirst({
    where: { targetId: target.id, metricId: metric.id, status: "open" },
  });
  if (existing) {
    return;
  }

  const hostName = target.alias ?? target.name;
  const alert = await prisma.alert.create({
    data: {
      targetId: target.id,
      metricId: metric.id,
      interfaceId: null,
      triggeredValue: 0,
      lastValue: 0,
      lastValueAt: now,
      severity: "critical",
      priority: "p1",
      responsibleTeam: target.responsibleTeam,
      hostName,
      subject: `${hostName} is down`,
      description: target.lastSeenAt ? `No reading since ${target.lastSeenAt.toISOString()}` : null,
    },
  });
  notifyAlert("opened", alert.id);
}

// A reading arrived: the host is back, so its host-down alert resolves.
export async function resolveHostDownAlert(targetId: number, at: Date) {
  const openAlert = await prisma.alert.findFirst({
    where: { targetId, metric: { metricKey: HOST_UP_METRIC_KEY }, status: "open" },
  });
  if (!openAlert) {
    return;
  }
  await prisma.alert.update({
    where: { id: openAlert.id },
    data: { lastValue: 1, lastValueAt: at, status: "resolved", resolvedAt: at },
  });
  notifyAlert("resolved", openAlert.id, { by: null, note: null });
}
