import type { DeviceKind } from "./monitoring";

export type TargetStatus = "up" | "down" | "unknown";

// Item from GET /targets.
export interface TargetSummary {
  id: number;
  // Hostname reported by the agent.
  name: string;
  // Shown instead of name when set (see displayName).
  alias: string | null;
  ipAddress: string | null;
  status: TargetStatus;
  responsibleTeam: string | null;
  lastSeenAt: string | null;
}

// A metric the target inherits, with its resolved policy.
export interface TargetMetric {
  metric: { id: number; metricKey: string; unit: string | null; deviceKind: DeviceKind | null };
  source: { id: number; name: string };
  overridden: boolean;
  reportIntervalSec: number;
  condition: "gt" | "lt" | "gte" | "lte" | "eq";
  warningThreshold: number | null;
  criticalThreshold: number | null;
  consecutiveBreaches: number;
  responsibleTeam: string | null;
  // Team set on the customization only (null: resource's team applies).
  customTeam: string | null;
  alertSubject: string;
  alertDescription: string | null;
  priority: "p1" | "p2" | "p3" | "p4";
}

// A mount point, disk or NIC the agent reports per-device metrics for.
export interface TargetInterface {
  id: number;
  kind: DeviceKind;
  name: string;
  // Off: its readings are dropped, so it is neither stored nor alerted on.
  monitored: boolean;
  lastSeenAt: string;
}

// GET /targets/:id.
export interface TargetDetail extends TargetSummary {
  type: string;
  os: string | null;
  arch: string | null;
  // e.g. "Ubuntu 22.04 (WSL)"; null until an agent that reports it enrolls.
  distro: string | null;
  description: string | null;
  createdAt: string;
  templates: { id: number; name: string }[];
  metrics: TargetMetric[];
  interfaces: TargetInterface[];
}

// Body for PATCH /targets/:id; null clears a field.
export interface TargetUpdateInput {
  alias: string | null;
  responsible_team: string | null;
}

// Item from GET /templates.
export interface TemplateSummary {
  id: number;
  name: string;
  description: string | null;
}

export type HistoryRange = "1h" | "6h" | "24h" | "7d";

// One time bucket: average and peak of the readings in it.
export interface HistoryPoint {
  t: string;
  avg: number;
  max: number;
}

// One line on a metric chart: the host-wide value (label null) or one interface.
export interface ChartSeries {
  label: string | null;
  points: HistoryPoint[];
}

// GET /targets/:id/history?range=…
export interface TargetHistory {
  range: HistoryRange;
  bucketSec: number;
  from: string;
  to: string;
  // One series per metric, and per interface for per-device metrics.
  metrics: { metricId: number; interfaceId: number | null; points: HistoryPoint[] }[];
}
