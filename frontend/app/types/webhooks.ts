import type { Priority } from "~/types/monitoring";

export type WebhookKind = "discord" | "slack" | "generic";

export const webhookKinds: { value: WebhookKind; label: string; help: string }[] = [
  { value: "discord", label: "Discord", help: "Channel settings → Integrations → Webhooks → Copy Webhook URL." },
  { value: "slack", label: "Slack", help: "Starts with https://hooks.slack.com/. Follow the steps below to get it." },
  { value: "generic", label: "Generic JSON", help: "Any endpoint; receives the event and alert fields as JSON." },
];

export interface WebhookRow {
  id: number;
  name: string;
  kind: WebhookKind;
  url: string;
  enabled: boolean;
  team: string | null;
  minPriority: Priority | null;
  lastDeliveredAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
}

// Request body for create and update.
export interface WebhookInput {
  name: string;
  kind: WebhookKind;
  url: string;
  enabled: boolean;
  team: string | null;
  min_priority: Priority | null;
}

export interface DeliveryResult {
  status: number | null;
  error: string | null;
}
