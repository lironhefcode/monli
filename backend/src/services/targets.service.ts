import { Prisma, type TemplateMetric } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type {
  AssignTemplateInput,
  CreateTargetInput,
  HistoryRange,
  OverrideInput,
  SubmitReadingInput,
  UpdateInterfaceInput,
  UpdateTargetInput,
} from "../schemas/targets.schema.js";
import {
  assertValidThresholds,
  DEFAULT_ALERT_SUBJECT,
  DEFAULT_INTERFACE_ALERT_SUBJECT,
  levelOf,
  renderMessage,
  type Level,
} from "../utils/alert-levels.js";
import { generateApiKey, hashApiKey } from "../utils/api-key.js";
import { HttpError } from "../utils/http-error.js";
import { resolvePolicy } from "../utils/resolve-policy.js";
import { resolveHostDownAlert } from "./host-down.service.js";
import { addCheck, completeCheck, takeUndelivered } from "./metric-checks.service.js";
import { notifyAlert } from "./notifications.service.js";

export async function resolveTemplateDefault(
  targetId: number,
  metricId: number
): Promise<TemplateMetric | null> {
  return prisma.templateMetric.findFirst({
    where: { metricId, template: { targetTemplates: { some: { targetId } } } },
    orderBy: { id: "asc" },
  });
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

// GET /targets/:id — admin detail: metadata, assigned templates, interfaces,
// and the resolved policy of every metric the target inherits.
export async function getTargetDetail(targetId: number) {
  const target = await prisma.target.findUnique({
    where: { id: targetId },
    omit: { apiKeyHash: true },
    include: {
      targetTemplates: {
        include: { template: { select: { id: true, name: true } } },
        orderBy: { id: "asc" },
      },
      interfaces: {
        select: { id: true, kind: true, name: true, monitored: true, lastSeenAt: true },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
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
      metric: { select: { id: true, metricKey: true, unit: true, deviceKind: true } },
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

// The target's metrics with their effective intervals, keeping metricId so
// callers can match check requests to keys.
async function effectiveMetrics(targetId: number) {
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
      metricId: templateMetric.metricId,
      metric_key: templateMetric.metric.metricKey,
      report_interval_sec: (override ?? templateMetric).reportIntervalSec,
    };
  });
}

// Longest effective report interval, 0 when the target has no metrics.
export async function longestReportIntervalSec(targetId: number) {
  const metrics = await effectiveMetrics(targetId);
  return Math.max(0, ...metrics.map(({ report_interval_sec }) => report_interval_sec));
}

// Agent-facing metric list. Kept for agents that predate pollAgent.
export async function getEffectiveMetrics(targetId: number) {
  const metrics = await effectiveMetrics(targetId);
  return metrics.map(({ metric_key, report_interval_sec }) => ({ metric_key, report_interval_sec }));
}

// Agent-facing poll: the metric list plus the metrics to collect right away.
// Handing out a check marks it delivered, so each is sent once.
export async function pollAgent(targetId: number) {
  const metrics = await effectiveMetrics(targetId);
  const requested = new Set(takeUndelivered(targetId));
  return {
    metrics: metrics.map(({ metric_key, report_interval_sec }) => ({ metric_key, report_interval_sec })),
    check_now: metrics.filter(({ metricId }) => requested.has(metricId)).map(({ metric_key }) => metric_key),
  };
}

// Asks the agent for a fresh reading of one metric on its next poll.
export async function requestMetricCheck(targetId: number, metricId: number) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }
  if (!(await resolveTemplateDefault(targetId, metricId))) {
    throw new HttpError(422, "metric is not assigned to this target via any template");
  }
  if (target.status !== "up") {
    throw new HttpError(409, "resource is offline; its agent can't take the check");
  }
  return addCheck(targetId, metricId);
}

type Policy = ReturnType<typeof resolvePolicy>;
type ReadingTarget = { id: number; name: string; alias: string | null };
type ReadingMetric = { id: number; metricKey: string; unit: string | null };

// Everything one reading is checked against, shared by every interface in a
// per-device submit.
interface ReadingContext {
  target: ReadingTarget;
  metric: ReadingMetric;
  policy: Policy;
  recordedAt: Date;
}

// Stores one value and opens, updates or resolves its alert. targetInterface
// is null for host-wide metrics.
async function recordValue(
  { target, metric, policy, recordedAt }: ReadingContext,
  targetInterface: { id: number; name: string } | null,
  value: number
) {
  const targetId = target.id;
  const interfaceId = targetInterface?.id ?? null;

  const reading = await prisma.metricReading.create({
    data: { targetId, metricId: metric.id, interfaceId, value, recordedAt },
  });

  const level = levelOf(value, policy.condition, policy.warningThreshold, policy.criticalThreshold);
  const openAlert = await prisma.alert.findFirst({
    where: { targetId, metricId: metric.id, interfaceId, status: "open" },
  });

  // An open alert keeps the name it opened with, even if the alias changed since.
  const hostName = openAlert?.hostName ?? target.alias ?? target.name;

  const message = (current: Level) => {
    const context = {
      metric: metric.metricKey,
      host: hostName,
      interface: targetInterface?.name ?? null,
      value,
      unit: metric.unit,
      severity: current,
      threshold: (current === "critical" ? policy.criticalThreshold : policy.warningThreshold) ?? 0,
    };
    const defaultSubject = targetInterface ? DEFAULT_INTERFACE_ALERT_SUBJECT : DEFAULT_ALERT_SUBJECT;
    return {
      subject: renderMessage(policy.alertSubject.trim() || defaultSubject, context),
      description: policy.alertDescription ? renderMessage(policy.alertDescription, context) : null,
    };
  };

  if (openAlert) {
    // One alert per (target, metric, interface): it follows the level, and a
    // single healthy reading resolves it.
    await prisma.alert.update({
      where: { id: openAlert.id },
      data: level
        ? { lastValue: value, lastValueAt: recordedAt, severity: level, ...message(level) }
        : { lastValue: value, lastValueAt: recordedAt, status: "resolved", resolvedAt: recordedAt },
    });
    // Only rising to critical is announced; dropping back to warning is not.
    if (!level) {
      notifyAlert("resolved", openAlert.id, { by: null, note: null });
    } else if (level === "critical" && openAlert.severity === "warning") {
      notifyAlert("escalated", openAlert.id);
    }
  } else if (level) {
    // consecutive_breaches guards against flapping: the last N readings (this
    // one included) must all breach some level before an alert opens.
    const recentReadings = await prisma.metricReading.findMany({
      where: { targetId, metricId: metric.id, interfaceId },
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
      const alert = await prisma.alert.create({
        data: {
          targetId,
          metricId: metric.id,
          interfaceId,
          triggeredValue: value,
          lastValue: value,
          lastValueAt: recordedAt,
          severity: level,
          responsibleTeam: policy.responsibleTeam,
          hostName,
          priority: policy.priority,
          ...message(level),
        },
      });
      notifyAlert("opened", alert.id);
    }
  }

  return reading;
}

// Stores a host-wide value, or one value per interface for per-device metrics.
// Returns the stored readings: none when every interface is unmonitored.
export async function submitReading(targetId: number, input: SubmitReadingInput) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const metric = await prisma.metric.findUnique({ where: { metricKey: input.metric_key } });
  if (!metric) {
    throw new HttpError(404, "unknown metric_key");
  }
  const { deviceKind } = metric;
  if (deviceKind && !input.devices) {
    throw new HttpError(422, "metric is measured per device; send devices instead of value");
  }
  if (!deviceKind && input.value === undefined) {
    throw new HttpError(422, "metric is host-wide; send value instead of devices");
  }

  const templateDefault = await resolveTemplateDefault(targetId, metric.id);
  if (!templateDefault) {
    throw new HttpError(422, "metric is not assigned to this target via any template");
  }

  const override = await prisma.targetMetricOverride.findUnique({
    where: { targetId_metricId: { targetId, metricId: metric.id } },
  });

  const recordedAt = input.recorded_at ? new Date(input.recorded_at) : new Date();
  const context: ReadingContext = {
    target,
    metric,
    policy: resolvePolicy(templateDefault, override, target.responsibleTeam),
    recordedAt,
  };

  await prisma.target.update({
    where: { id: targetId },
    data: { lastSeenAt: recordedAt, status: "up" },
  });
  // Checked on every reading, not only when the target was down: re-enrolling
  // sets it up without one.
  await resolveHostDownAlert(targetId, recordedAt);

  const recorded = await recordReadingValues(context, deviceKind, input);
  // A requested check is done once its reading is recorded and alerts
  // evaluated; the UI shows its values with the level each reads at.
  const { policy } = context;
  completeCheck(
    targetId,
    metric.id,
    recorded.map(({ reading, interfaceName }) => ({
      interfaceName,
      value: reading.value,
      level: levelOf(reading.value, policy.condition, policy.warningThreshold, policy.criticalThreshold),
    }))
  );
  return recorded.map(({ reading }) => reading);
}

// Each stored reading with its interface's name (null for host-wide metrics).
async function recordReadingValues(
  context: ReadingContext,
  deviceKind: string | null,
  input: SubmitReadingInput
) {
  const targetId = context.target.id;
  const { recordedAt } = context;

  // Both present as checked above (the schema allows exactly one of them).
  if (!deviceKind) {
    return [{ reading: await recordValue(context, null, input.value!), interfaceName: null }];
  }

  // Interfaces are independent, so they are recorded concurrently.
  const readings = await Promise.all(
    input.devices!.map(async ({ device, value }) => {
      // Interfaces are created the first time the agent reports them.
      const targetInterface = await prisma.targetInterface.upsert({
        where: { targetId_kind_name: { targetId, kind: deviceKind, name: device } },
        create: { targetId, kind: deviceKind, name: device, lastSeenAt: recordedAt },
        update: { lastSeenAt: recordedAt },
      });
      // Not monitored: the value is dropped, so it is neither stored nor alerted on.
      if (!targetInterface.monitored) return null;
      return { reading: await recordValue(context, targetInterface, value), interfaceName: targetInterface.name };
    })
  );
  return readings.filter((recorded) => recorded !== null);
}

// Comment left on alerts resolved by turning their interface off.
const MONITORING_STOPPED_COMMENT = "Monitoring of this interface has been stopped.";

// Turning monitoring off also resolves the interface's open alerts, since no
// reading will arrive to resolve them. Each gets a resolve comment by author,
// like a manual resolve.
export async function setInterfaceMonitored(
  targetId: number,
  interfaceId: number,
  input: UpdateInterfaceInput,
  author: string
) {
  const existing = await prisma.targetInterface.findFirst({ where: { id: interfaceId, targetId } });
  if (!existing) {
    throw new HttpError(404, "interface not found");
  }

  const { updated, resolvedIds } = await prisma.$transaction(async (tx) => {
    let alertIds: number[] = [];
    if (!input.monitored) {
      const openAlerts = await tx.alert.findMany({
        where: { interfaceId, status: "open" },
        select: { id: true },
      });
      alertIds = openAlerts.map((alert) => alert.id);
      await tx.alert.updateMany({
        where: { id: { in: alertIds } },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      await tx.alertComment.createMany({
        data: alertIds.map((alertId) => ({
          alertId,
          action: "resolve",
          body: MONITORING_STOPPED_COMMENT,
          author,
        })),
      });
    }
    const updated = await tx.targetInterface.update({
      where: { id: interfaceId },
      data: { monitored: input.monitored },
    });
    return { updated, resolvedIds: alertIds };
  });

  // Sent once the transaction has committed, so a rollback announces nothing.
  for (const alertId of resolvedIds) {
    notifyAlert("resolved", alertId, { by: author, note: MONITORING_STOPPED_COMMENT });
  }
  return updated;
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

// Readings of every metric (and, for per-device metrics, every interface) on
// the target within the range, averaged per time bucket. max keeps short
// spikes visible that the average flattens.
export async function getTargetHistory(targetId: number, range: HistoryRange) {
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "target not found");
  }

  const { span, bucket } = historyWindows[range];
  const rows = await prisma.$queryRaw<
    { metric_id: number; interface_id: number | null; t: Date; avg: number; max: number }[]
  >`
    SELECT
      metric_id,
      interface_id,
      to_timestamp(floor(extract(epoch FROM recorded_at) / ${bucket}) * ${bucket}) AS t,
      avg(value) AS avg,
      max(value) AS max
    FROM metric_readings
    WHERE target_id = ${targetId}
      AND recorded_at >= now() - make_interval(secs => ${span})
    GROUP BY metric_id, interface_id, t
    ORDER BY metric_id, interface_id, t
  `;

  // Rows arrive ordered by series, so a new series starts whenever the key changes.
  const series: { metricId: number; interfaceId: number | null; points: HistoryPoint[] }[] = [];
  for (const row of rows) {
    let current = series.at(-1);
    if (current?.metricId !== row.metric_id || current.interfaceId !== row.interface_id) {
      current = { metricId: row.metric_id, interfaceId: row.interface_id, points: [] };
      series.push(current);
    }
    current.points.push({ t: row.t.toISOString(), avg: Number(row.avg), max: Number(row.max) });
  }
  return {
    range,
    bucketSec: bucket,
    from: new Date(Date.now() - span * 1000).toISOString(),
    to: new Date().toISOString(),
    metrics: series,
  };
}
