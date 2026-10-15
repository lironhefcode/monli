export type TargetStatus = "up" | "down" | "unknown";

// Item from GET /targets.
export interface TargetSummary {
  id: number;
  name: string;
  ipAddress: string | null;
  status: TargetStatus;
  responsibleTeam: string | null;
  lastSeenAt: string | null;
}

// A metric the target inherits, with its resolved policy.
export interface TargetMetric {
  metric: { id: number; metricKey: string; unit: string | null };
  source: { id: number; name: string };
  overridden: boolean;
  reportIntervalSec: number;
  condition: "gt" | "lt" | "gte" | "lte" | "eq";
  warningThreshold: number | null;
  criticalThreshold: number | null;
  consecutiveBreaches: number;
  responsibleTeam: string | null;
  priority: "p1" | "p2" | "p3" | "p4";
}

// GET /targets/:id.
export interface TargetDetail extends TargetSummary {
  type: string;
  os: string | null;
  arch: string | null;
  description: string | null;
  createdAt: string;
  templates: { id: number; name: string }[];
  metrics: TargetMetric[];
}

// Item from GET /templates.
export interface TemplateSummary {
  id: number;
  name: string;
  description: string | null;
}
