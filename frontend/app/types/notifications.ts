import type { Priority } from "~/types/monitoring";

export type DestinationKind = "discord" | "slack" | "generic" | "email";
export type SecurityMode = "tls" | "starttls" | "none";

export const destinationKinds: { value: DestinationKind; label: string; icon: string; help: string }[] = [
  {
    value: "discord",
    label: "Discord",
    icon: "i-lucide-message-circle",
    help: "Channel settings → Integrations → Webhooks → Copy Webhook URL.",
  },
  {
    value: "slack",
    label: "Slack",
    icon: "i-lucide-hash",
    help: "Starts with https://hooks.slack.com/. Follow the steps below to get it.",
  },
  {
    value: "generic",
    label: "Generic JSON",
    icon: "i-lucide-webhook",
    help: "Any endpoint; receives the event and alert fields as JSON.",
  },
  { value: "email", label: "Email", icon: "i-lucide-mail", help: "Monli users, other addresses, or both." },
];

export const kindInfo = (kind: DestinationKind) => destinationKinds.find((item) => item.value === kind)!;

export interface DestinationRow {
  id: number;
  name: string;
  kind: DestinationKind;
  // Host of the saved URL (the URL itself never leaves the server); null for
  // email, or when it can't be decrypted any more.
  urlHost: string | null;
  emailAddresses: string[];
  userIds: string[];
  ruleCount: number;
  lastDeliveredAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
}

export type DestinationInput =
  | { name: string; kind: Exclude<DestinationKind, "email">; url: string }
  | { name: string; kind: "email"; email_addresses: string[]; user_ids: string[] };

// PATCH body: kind can't change; an omitted url keeps the saved one.
export interface DestinationUpdate {
  name?: string;
  url?: string;
  email_addresses?: string[];
  user_ids?: string[];
}

export interface RuleRow {
  id: number;
  name: string;
  // Empty: every team.
  teams: string[];
  minPriority: Priority | null;
  enabled: boolean;
  destinationIds: number[];
}

export interface RuleInput {
  name: string;
  teams: string[];
  min_priority: Priority | null;
  enabled: boolean;
  destination_ids: number[];
}

// status is null for email, which has no HTTP response.
export interface DeliveryResult {
  status: number | null;
  error: string | null;
}

export type EmailServer =
  | { configured: false }
  | {
      configured: true;
      host: string;
      port: number;
      security: SecurityMode;
      username: string | null;
      fromAddress: string;
      updatedAt: string;
      hasPassword: boolean;
    };

// An omitted password keeps the saved one.
export interface EmailServerInput {
  host: string;
  port: number;
  security: SecurityMode;
  username: string | null;
  password?: string;
  from: string;
}

export interface UserOption {
  label: string;
  description: string;
  value: string;
}

// "Every team", or the teams joined.
export const teamsLabel = (teams: string[]) => (teams.length ? teams.join(", ") : "Every team");

export function priorityLabel(priority: Priority | null) {
  if (!priority) return "Any priority";
  return priority === "p1" ? "P1 only" : `${priority.toUpperCase()} and higher`;
}

// Where a destination sends, without revealing the URL.
export function destinationWhere(row: DestinationRow) {
  if (row.kind !== "email") return row.urlHost ?? "URL unreadable: enter it again";
  const parts = [...row.emailAddresses];
  if (row.userIds.length) parts.unshift(row.userIds.length === 1 ? "1 user" : `${row.userIds.length} users`);
  return parts.join(", ");
}
