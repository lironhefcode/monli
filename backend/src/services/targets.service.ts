import { Prisma, type TargetMetricOverride, type TemplateMetric } from "@prisma/client";
import { prisma } from "../db/prisma";
import type {
  AssignTemplateInput,
  CreateTargetInput,
  HistoryRange,
  OverrideInput,
  SubmitReadingInput,
  UpdateTargetInput,
} from "../schemas/targets.schema";
import {
  assertValidThresholds,
  DEFAULT_ALERT_SUBJECT,
  levelOf,
  renderMessage,
  type Level,
} from "../utils/alert-levels";
import { generateApiKey, hashApiKey } from "../utils/api-key";
import { HttpError } from "../utils/http-error";

async function resolveTemplateDefault(
  targetId: number,
  metricId: number
): Promise<TemplateMetric | null> {
  return prisma.templateMetric.findFirst({
    where: { metricId, template: { targetTemplates: { some: { targetId } } } },
    orderBy: { id: "asc" },
  });
}

// Policy fallback chain, narrowest wins: override → target team (team only) →
// template default. Shared by alerting and the UI so both see the same values.
// A customized metric (override) replaces the template's policy as a whole,
// null thresholds included. Only the team falls through: override, then the
// target's team, then the template's.
function resolvePolicy(
  templateDefault: TemplateMetric,
  override: TargetMetricOverride | null | undefined,
  targetResponsibleTeam: string | null
) {
  const policy = override ?? templateDefault;
  return {
    reportIntervalSec: policy.reportIntervalSec,
    condition: policy.condition,
    warningThreshold: policy.warningThreshold,
    criticalThreshold: policy.criticalThreshold,
    consecutiveBreaches: policy.consecutiveBreaches,
    responsibleTeam:
      override?.responsibleTeam ?? targetResponsibleTeam ?? templateDefault.responsibleTeam,
    alertSubject: policy.alertSubject,
    alertDescription: policy.alertDescription,
    priority: policy.priority,
  };
}

// GET /targets — admin list, sorted by displayed name (alias, else name).
// Never exposes the API key hash.
export async function listTargets() {
  const targets = await prisma.target.findMany({
    select: {
      id: true,
      name: true,
      alias: true,
      ipAddress: true,
      status: true,
      responsibleTeam: true,
      lastSeenAt: true,
    },
  });
  return targets.sort((a, b) => (a.alias ?? a.name).localeCompare(b.alias ?? b.name));
}

// GET /targets/:id — admin detail: metadata, assigned templates, and the
// resolved policy of every metric the target inherits.
export async function getTargetDetail(targetId: number) {
  const target = await prisma.target.findUnique({
    where: { id: targetId },
    omit: { apiKeyHash: true },
    include: {
      targetTemplates: {
        include: { template: { select: { id: true, name: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  // Same tie-break as resolveTemplateDefault: lowest template_metrics.id wins.
  const templateMetrics = await prisma.templateMetric.findMany({
    where: { template: { targetTemplates: { some: { targetId } } } },
    orderBy: { id: "asc" },
    include: {
      metric: { select: { id: true, metricKey: true, unit: true } },
      template: { select: { id: true, name: true } },
    },
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

  const { targetTemplates, ...metadata } = target;
  return {
    ...metadata,
    templates: targetTemplates.map((targetTemplate) => targetTemplate.template),
    metrics: [...byMetricId.values()].map((templateMetric) => {
      const override = overrideByMetricId.get(templateMetric.metricId);
      return {
        metric: templateMetric.metric,
        source: templateMetric.template,
        overridden: override !== undefined,
        // The customized team itself; responsibleTeam below is the resolved one.
        customTeam: override?.responsibleTeam ?? null,
        ...resolvePolicy(templateMetric, override, target.responsibleTeam),
      };
    }),
  };
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

// Open alerts keep the team and name they opened with; only alerts opened
// after this use the new values.
export async function updateTarget(targetId: number, input: UpdateTargetInput) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  return prisma.target.update({
    where: { id: targetId },
    data: { alias: input.alias, responsibleTeam: input.responsible_team },
    omit: { apiKeyHash: true },
  });
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

// Customize a metric for one target: the stored policy replaces the template's
// as a whole, so later template edits don't reach it.
export async function setOverride(targetId: number, metricId: number, input: OverrideInput) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const templateDefault = await resolveTemplateDefault(targetId, metricId);
  if (!templateDefault) {
    throw new HttpError(
      422,
      "metric is not reachable via any template assigned to this target"
    );
  }

  assertValidThresholds(input.condition, input.warning_threshold, input.critical_threshold);

  const policy = {
    reportIntervalSec: input.report_interval_sec,
    condition: input.condition,
    warningThreshold: input.warning_threshold,
    criticalThreshold: input.critical_threshold,
    consecutiveBreaches: input.consecutive_breaches,
    responsibleTeam: input.responsible_team,
    alertSubject: input.alert_subject,
    alertDescription: input.alert_description,
    priority: input.priority,
  };
  return prisma.targetMetricOverride.upsert({
    where: { targetId_metricId: { targetId, metricId } },
    create: { targetId, metricId, ...policy },
    update: policy,
  });
}

// Back to the template's policy.
export async function removeOverride(targetId: number, metricId: number) {
  const result = await prisma.targetMetricOverride.deleteMany({ where: { targetId, metricId } });
  if (result.count === 0) {
    throw new HttpError(404, "metric is not customized for this target");
  }
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
      report_interval_sec: (override ?? templateMetric).reportIntervalSec,
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

  const policy = resolvePolicy(templateDefault, override, target.responsibleTeam);

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

  const level = levelOf(input.value, policy.condition, policy.warningThreshold, policy.criticalThreshold);
  const openAlert = await prisma.alert.findFirst({
    where: { targetId, metricId: metric.id, status: "open" },
  });

  // An open alert keeps the name it opened with, even if the alias changed since.
  const hostName = openAlert?.hostName ?? target.alias ?? target.name;

  const message = (current: Level) => {
    const context = {
      metric: metric.metricKey,
      host: hostName,
      value: input.value,
      unit: metric.unit,
      severity: current,
      threshold: (current === "critical" ? policy.criticalThreshold : policy.warningThreshold) ?? 0,
    };
    return {
      subject: renderMessage(policy.alertSubject.trim() || DEFAULT_ALERT_SUBJECT, context),
      description: policy.alertDescription ? renderMessage(policy.alertDescription, context) : null,
    };
  };

  if (openAlert) {
    // One alert per (target, metric): it follows the level, and a single
    // healthy reading resolves it.
    await prisma.alert.update({
      where: { id: openAlert.id },
      data: level
        ? { lastValue: input.value, lastValueAt: recordedAt, severity: level, ...message(level) }
        : { lastValue: input.value, lastValueAt: recordedAt, status: "resolved", resolvedAt: recordedAt },
    });
  } else if (level) {
    // consecutive_breaches guards against flapping: the last N readings (this
    // one included) must all breach some level before an alert opens.
    const recentReadings = await prisma.metricReading.findMany({
      where: { targetId, metricId: metric.id },
      orderBy: { recordedAt: "desc" },
      take: policy.consecutiveBreaches,
    });
    const allBreached =
      recentReadings.length === policy.consecutiveBreaches &&
      recentReadings.every(
        (recent) =>
          levelOf(recent.value, policy.condition, policy.warningThreshold, policy.criticalThreshold) !== null
      );

    if (allBreached) {
      await prisma.alert.create({
        data: {
          targetId,
          metricId: metric.id,
          triggeredValue: input.value,
          lastValue: input.value,
          lastValueAt: recordedAt,
          severity: level,
          responsibleTeam: policy.responsibleTeam,
          hostName,
          priority: policy.priority,
          ...message(level),
        },
      });
    }
  }

  return reading;
}

// Window length and bucket size per range, in seconds. Buckets keep every
// range at a few hundred points (60-336) however long it is.
const historyWindows: Record<HistoryRange, { span: number; bucket: number }> = {
  "1h": { span: 3600, bucket: 60 },
  "6h": { span: 6 * 3600, bucket: 120 },
  "24h": { span: 24 * 3600, bucket: 300 },
  "7d": { span: 7 * 24 * 3600, bucket: 1800 },
};

export interface HistoryPoint {
  t: string;
  avg: number;
  max: number;
}

// Readings of every metric on the target within the range, averaged per time
// bucket. max keeps short spikes visible that the average flattens.
export async function getTargetHistory(targetId: number, range: HistoryRange) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const { span, bucket } = historyWindows[range];
  const rows = await prisma.$queryRaw<{ metric_id: number; t: Date; avg: number; max: number }[]>`
    SELECT
      metric_id,
      to_timestamp(floor(extract(epoch FROM recorded_at) / ${bucket}) * ${bucket}) AS t,
      avg(value) AS avg,
      max(value) AS max
    FROM metric_readings
    WHERE target_id = ${targetId}
      AND recorded_at >= now() - make_interval(secs => ${span})
    GROUP BY metric_id, t
    ORDER BY metric_id, t
  `;

  const byMetric = new Map<number, HistoryPoint[]>();
  for (const row of rows) {
    const points = byMetric.get(row.metric_id) ?? [];
    points.push({ t: row.t.toISOString(), avg: Number(row.avg), max: Number(row.max) });
    byMetric.set(row.metric_id, points);
  }
  return {
    range,
    bucketSec: bucket,
    from: new Date(Date.now() - span * 1000).toISOString(),
    to: new Date().toISOString(),
    metrics: [...byMetric].map(([metricId, points]) => ({ metricId, points })),
  };
}
