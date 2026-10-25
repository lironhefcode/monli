import { setTimeout as sleep } from "node:timers/promises";
import type { EmailServer, Prisma } from "@prisma/client";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { formatNumber } from "../utils/alert-levels.js";
import { open } from "../utils/secret-box.js";
import { loadEmailServer } from "./email-server.service.js";

// Alert notifications: one message when an alert opens, one when it escalates
// from warning to critical, one when it resolves. Rules pick the alerts and
// the destinations they go to. Delivery runs after the alert is saved and
// never fails or delays the request that changed it.

// A destination with what delivery needs to address an email one.
export const destinationWithRecipients = {
  include: { recipients: { select: { userId: true, user: { select: { email: true } } } } },
} satisfies Prisma.NotificationDestinationDefaultArgs;

export type DestinationWithRecipients = Prisma.NotificationDestinationGetPayload<typeof destinationWithRecipients>;

export type AlertEvent = "opened" | "escalated" | "resolved";

// Who resolved the alert and why; by is null when a healthy reading did.
export interface Resolution {
  by: string | null;
  note: string | null;
}

// status is the HTTP status; always null for email.
export interface DeliveryResult {
  status: number | null;
  error: string | null;
}

interface Attempt extends DeliveryResult {
  retryable: boolean;
}

// One event as every destination gets it. emailServer is loaded once per
// event, and only when an email destination is among them.
interface Delivery {
  event: AlertEvent;
  message: AlertMessage;
  resolution?: Resolution;
  emailServer: EmailServer | null;
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
    console.error(`notification for alert ${alertId} failed`, err)
  );
}

// The enabled rules matching the alert's team and priority. p1 is highest, so
// "at or above min_priority" is priority <= min_priority.
function matchingRules(team: string | null, priority: string): Prisma.NotificationRuleWhereInput {
  const anyTeam = { teams: { isEmpty: true } };
  return {
    enabled: true,
    AND: [
      team === null ? anyTeam : { OR: [anyTeam, { teams: { has: team } }] },
      { OR: [{ minPriority: null }, { minPriority: { gte: priority } }] },
    ],
  };
}

async function sendAlert(event: AlertEvent, alertId: number, resolution?: Resolution) {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { metric: { select: { metricKey: true, unit: true } }, interface: { select: { name: true } } },
  });
  if (!alert) return;

  // A destination picked by several matching rules gets one message.
  const destinations = await prisma.notificationDestination.findMany({
    ...destinationWithRecipients,
    where: { rules: { some: { rule: matchingRules(alert.responsibleTeam, alert.priority) } } },
  });
  if (destinations.length === 0) return;

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
  const delivery: Delivery = { event, message, resolution, emailServer: await emailServerFor(destinations) };
  await Promise.all(destinations.map((destination) => deliverAndRecord(destination, delivery)));
}

function emailServerFor(destinations: DestinationWithRecipients[]) {
  return destinations.some((destination) => destination.kind === "email") ? loadEmailServer() : null;
}

// Sends a sample alert so an admin can check the destination and the formatting.
export async function sendTestMessage(destination: DestinationWithRecipients): Promise<DeliveryResult> {
  const sample: AlertMessage = {
    id: 0,
    subject: "Test notification from Monli",
    description: "Alerts that rules send here will look like this.",
    host: "example-host",
    metric: "cpu_usage",
    interface: null,
    unit: "%",
    severity: "warning",
    priority: "p3",
    team: null,
    triggeredValue: 91.5,
    lastValue: 91.5,
    openedAt: new Date(),
    resolvedAt: null,
  };
  return deliverAndRecord(destination, {
    event: "opened",
    message: sample,
    emailServer: await emailServerFor([destination]),
  });
}

async function deliverAndRecord(destination: DestinationWithRecipients, delivery: Delivery): Promise<DeliveryResult> {
  const { event, message, resolution } = delivery;
  const result =
    destination.kind === "email"
      ? await sendEmail(destination, delivery)
      : await sendWebhook(destination, buildPayload(destination.kind, event, message, resolution));
  if (result.error) {
    console.error(`notification destination "${destination.name}" (${destination.id}) failed: ${result.error}`);
  }
  // updateMany: the destination may have been deleted while the request was out.
  await prisma.notificationDestination.updateMany({
    where: { id: destination.id },
    data: { lastDeliveredAt: new Date(), lastStatus: result.status, lastError: result.error },
  });
  return result;
}

// One retry for errors that may pass: rate limits, server errors, timeouts.
async function withRetry(sendOnce: () => Promise<Attempt>): Promise<DeliveryResult> {
  let attempt = await sendOnce();
  if (attempt.error && attempt.retryable) {
    await sleep(RETRY_DELAY_MS);
    attempt = await sendOnce();
  }
  return { status: attempt.status, error: attempt.error };
}

async function sendWebhook(destination: DestinationWithRecipients, payload: unknown): Promise<DeliveryResult> {
  if (destination.url === null) return { status: null, error: "no URL saved; enter it again" };
  let url: string;
  try {
    url = open(destination.url);
  } catch (err) {
    return { status: null, error: errorText(err) };
  }
  return withRetry(() => postWebhook(url, payload));
}

async function postWebhook(url: string, payload: unknown): Promise<Attempt> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Only the saved URL is ever called; a redirect elsewhere fails the delivery.
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return { status: response.status, error: null, retryable: false };
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    return {
      status: response.status,
      error: `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      retryable: response.status === 429 || response.status >= 500,
    };
  } catch (err) {
    return { status: null, error: errorText(err), retryable: true };
  }
}

// Rebuilt only when an admin saves the server (updatedAt changes).
let transport: { version: number; transporter: Transporter } | null = null;

function transporterFor(server: EmailServer) {
  const version = server.updatedAt.getTime();
  if (transport?.version !== version) {
    transport?.transporter.close();
    transport = {
      version,
      transporter: nodemailer.createTransport({
        host: server.host,
        port: server.port,
        secure: server.security === "tls",
        requireTLS: server.security === "starttls",
        auth: server.username ? { user: server.username, pass: server.password ? open(server.password) : "" } : undefined,
        connectionTimeout: REQUEST_TIMEOUT_MS,
        greetingTimeout: REQUEST_TIMEOUT_MS,
        socketTimeout: REQUEST_TIMEOUT_MS,
      }),
    };
  }
  return transport.transporter;
}

async function sendEmail(
  destination: DestinationWithRecipients,
  { event, message, resolution, emailServer: server }: Delivery
): Promise<DeliveryResult> {
  if (!server) return { status: null, error: "email server is not set up" };
  // Case-insensitive de-duplication.
  const addresses = [...destination.emailAddresses, ...destination.recipients.map((r) => r.user.email)];
  const recipients = [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()];
  if (recipients.length === 0) return { status: null, error: "no recipients" };

  let transporter: Transporter;
  try {
    transporter = transporterFor(server);
  } catch (err) {
    // The saved password can't be decrypted.
    return { status: null, error: errorText(err) };
  }
  const mail = {
    from: server.fromAddress,
    // Bcc so recipients don't see each other's addresses.
    to: server.fromAddress,
    bcc: recipients,
    ...buildEmail(event, message, resolution),
  };
  return withRetry(async () => {
    try {
      await transporter.sendMail(mail);
      return { status: null, error: null, retryable: false };
    } catch (err) {
      // SMTP 5xx replies are permanent; 4xx and connection errors may pass.
      const code = (err as { responseCode?: number }).responseCode;
      return { status: null, error: errorText(err), retryable: code === undefined || code < 500 };
    }
  });
}

// fetch reports every network failure as "fetch failed"; the cause says which
// (its code, e.g. ECONNREFUSED, since some causes have no message).
function errorText(err: unknown) {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code || cause?.message;
  return detail ? `${err.message}: ${detail}` : err.message;
}

const messageTitle = (event: AlertEvent, message: AlertMessage) => `${eventLabel(event, message.severity)} ${message.subject}`;

const messageColor = (event: AlertEvent, message: AlertMessage) =>
  event === "resolved" ? colors.resolved : message.severity === "critical" ? colors.critical : colors.warning;

const hexColor = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function buildEmail(event: AlertEvent, message: AlertMessage, resolution?: Resolution) {
  const subject = messageTitle(event, message);
  const fields = messageFields(event, message, resolution);
  const text = [
    message.description,
    fields.map(([name, value]) => `${name}: ${value}`).join("\n"),
    `Open in Monli: ${ALERTS_URL}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const rows = fields
    .map(
      ([name, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">${escapeHtml(name)}</td>` +
        `<td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
    )
    .join("");
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111827;` +
    `border-left:4px solid ${hexColor(messageColor(event, message))};padding:4px 16px">` +
    `<h2 style="font-size:16px;margin:8px 0">${escapeHtml(subject)}</h2>` +
    (message.description ? `<p style="margin:8px 0">${escapeHtml(message.description)}</p>` : "") +
    `<table style="border-collapse:collapse;margin:8px 0">${rows}</table>` +
    `<p style="margin:12px 0 8px"><a href="${ALERTS_URL}">Open in Monli</a></p></div>`;
  return { subject, text, html };
}

function buildPayload(kind: string, event: AlertEvent, message: AlertMessage, resolution?: Resolution) {
  const title = messageTitle(event, message);
  const color = messageColor(event, message);
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
            color: hexColor(color),
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
