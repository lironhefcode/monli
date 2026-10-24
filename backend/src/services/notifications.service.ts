import { setTimeout as sleep } from "node:timers/promises";
import type { Webhook } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { formatNumber } from "../utils/alert-levels.js";

// Alert webhooks: one message when an alert opens, one when it escalates from
// warning to critical, one when it resolves. Delivery runs after the alert is
// saved and never fails or delays the request that changed it.

export type AlertEvent = "opened" | "escalated" | "resolved";

// Who resolved the alert and why; by is null when a healthy reading did.
export interface Resolution {
  by: string | null;
  note: string | null;
}

export interface DeliveryResult {
  status: number | null;
  error: string | null;
}

// What a message says about the alert, whichever format it is sent in.
interface AlertMessage {
  id: number;
  subject: string;
  description: string | null;
  host: string;
  metric: string;
  interface: string | null;
  unit: string | null;
  severity: string;
  priority: string;
  team: string | null;
  triggeredValue: number;
  lastValue: number | null;
  openedAt: Date;
  resolvedAt: Date | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;
const ALERTS_URL = `${new URL(env.PUBLIC_API_URL).origin}/alerts`;

const colors = { critical: 0xdc2626, warning: 0xf59e0b, resolved: 0x16a34a };

export function notifyAlert(event: AlertEvent, alertId: number, resolution?: Resolution) {
  sendAlert(event, alertId, resolution).catch((err: unknown) =>
    console.error(`webhook notification for alert ${alertId} failed`, err)
  );
}

async function sendAlert(event: AlertEvent, alertId: number, resolution?: Resolution) {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { metric: { select: { metricKey: true, unit: true } }, interface: { select: { name: true } } },
  });
  if (!alert) return;

  // p1 is highest, so "at or above min_priority" is priority <= min_priority.
  const webhooks = await prisma.webhook.findMany({
    where: {
      enabled: true,
      AND: [
        { OR: [{ team: null }, { team: alert.responsibleTeam }] },
        { OR: [{ minPriority: null }, { minPriority: { gte: alert.priority } }] },
      ],
    },
  });
  if (webhooks.length === 0) return;

  const message: AlertMessage = {
    id: alert.id,
    subject: alert.subject,
    description: alert.description,
    host: alert.hostName,
    metric: alert.metric.metricKey,
    interface: alert.interface?.name ?? null,
    unit: alert.metric.unit,
    severity: alert.severity,
    priority: alert.priority,
    team: alert.responsibleTeam,
    triggeredValue: alert.triggeredValue,
    lastValue: alert.lastValue,
    openedAt: alert.openedAt,
    resolvedAt: alert.resolvedAt,
  };
  await Promise.all(webhooks.map((webhook) => deliverAndRecord(webhook, event, message, resolution)));
}

// Sends a sample alert so an admin can check the URL and the formatting.
export function sendTestMessage(webhook: Webhook): Promise<DeliveryResult> {
  const now = new Date();
  const sample: AlertMessage = {
    id: 0,
    subject: "Test notification from Monli",
    description: "Alerts that match this webhook's filters will look like this.",
    host: "example-host",
    metric: "cpu_usage",
    interface: null,
    unit: "%",
    severity: "warning",
    priority: webhook.minPriority ?? "p3",
    team: webhook.team,
    triggeredValue: 91.5,
    lastValue: 91.5,
    openedAt: now,
    resolvedAt: null,
  };
  return deliverAndRecord(webhook, "opened", sample);
}

async function deliverAndRecord(
  webhook: Webhook,
  event: AlertEvent,
  message: AlertMessage,
  resolution?: Resolution
): Promise<DeliveryResult> {
  const result = await deliver(webhook.url, buildPayload(webhook.kind, event, message, resolution));
  if (result.error) {
    console.error(`webhook "${webhook.name}" (${webhook.id}) failed: ${result.error}`);
  }
  // updateMany: the webhook may have been deleted while the request was out.
  await prisma.webhook.updateMany({
    where: { id: webhook.id },
    data: { lastDeliveredAt: new Date(), lastStatus: result.status, lastError: result.error },
  });
  return result;
}

// One retry for errors that may pass: rate limits, server errors, timeouts.
async function deliver(url: string, payload: unknown): Promise<DeliveryResult> {
  let result: DeliveryResult = { status: null, error: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Only the saved URL is ever called; a redirect elsewhere fails the delivery.
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return { status: response.status, error: null };
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      result = { status: response.status, error: `HTTP ${response.status}${detail ? `: ${detail}` : ""}` };
      if (response.status !== 429 && response.status < 500) return result;
    } catch (err) {
      result = { status: null, error: errorText(err) };
    }
  }
  return result;
}

// fetch reports every network failure as "fetch failed"; the cause says which
// (its code, e.g. ECONNREFUSED, since some causes have no message).
function errorText(err: unknown) {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code || cause?.message;
  return detail ? `${err.message}: ${detail}` : err.message;
}

function buildPayload(kind: string, event: AlertEvent, message: AlertMessage, resolution?: Resolution) {
  const title = `${eventLabel(event, message.severity)} ${message.subject}`;
  const color = event === "resolved" ? colors.resolved : message.severity === "critical" ? colors.critical : colors.warning;
  const fields = messageFields(event, message, resolution);

  switch (kind) {
    case "discord":
      return {
        embeds: [
          {
            // Discord's limits: 256 characters for the title, 4096 for the description.
            title: title.slice(0, 256),
            url: ALERTS_URL,
            description: message.description?.slice(0, 4096) ?? undefined,
            color,
            fields: fields.map(([name, value]) => ({ name, value: value.slice(0, 1024), inline: true })),
            timestamp: new Date().toISOString(),
          },
        ],
      };
    case "slack":
      return {
        text: `${title} <${ALERTS_URL}|Open in Monli>`,
        attachments: [
          {
            color: `#${color.toString(16).padStart(6, "0")}`,
            text: message.description ?? undefined,
            fields: fields.map(([name, value]) => ({ title: name, value, short: true })),
          },
        ],
      };
    default:
      return { event, url: ALERTS_URL, alert: message, resolution: resolution ?? null };
  }
}

function eventLabel(event: AlertEvent, severity: string) {
  switch (event) {
    case "opened":
      return `[${severity.toUpperCase()}]`;
    case "escalated":
      return "[ESCALATED TO CRITICAL]";
    case "resolved":
      return "[RESOLVED]";
  }
}

// Name/value pairs shown under the title; empty values are left out.
function messageFields(event: AlertEvent, message: AlertMessage, resolution?: Resolution): [string, string][] {
  const unit = message.unit ?? "";
  const value = message.lastValue ?? message.triggeredValue;
  const fields: [string, string | null][] = [
    ["Host", message.host],
    ["Metric", message.interface ? `${message.metric} (${message.interface})` : message.metric],
    [event === "resolved" ? "Last value" : "Value", `${formatNumber(value)}${unit}`],
    ["Priority", message.priority.toUpperCase()],
    ["Team", message.team],
  ];
  if (event === "resolved") {
    const resolvedAt = message.resolvedAt ?? new Date();
    fields.push(
      ["Duration", formatDuration(resolvedAt.getTime() - message.openedAt.getTime())],
      ["Resolved by", resolution?.by ?? "Recovered"],
      ["Note", resolution?.note ?? null]
    );
  }
  return fields.filter((field): field is [string, string] => Boolean(field[1]));
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.max(0, Math.round(ms / 1000))}s`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const parts = [days && `${days}d`, hours && `${hours}h`, minutes % 60 && `${minutes % 60}m`];
  return parts.filter(Boolean).join(" ");
}
