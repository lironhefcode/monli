export type Condition = "gt" | "lt" | "gte" | "lte" | "eq";
export type Severity = "warning" | "critical";
export type Priority = "p1" | "p2" | "p3" | "p4";

// Item from GET /metrics.
export interface CatalogMetric {
  id: number;
  metricKey: string;
  unit: string | null;
  description: string | null;
  defaultCondition: Condition | null;
  defaultThreshold: number | null;
  defaultSeverity: Severity | null;
  defaultPriority: Priority | null;
  defaultReportIntervalSec: number | null;
}

// A metric's policy inside a template.
export interface TemplateMetric {
  id: number;
  metricId: number;
  reportIntervalSec: number;
  condition: Condition;
  threshold: number;
  consecutiveBreaches: number;
  severity: Severity;
  responsibleTeam: string | null;
  alertSubject: string;
  alertDescription: string | null;
  priority: Priority;
  metric: { id: number; metricKey: string; unit: string | null };
}

// GET /templates/:id.
export interface TemplateDetail {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  targetCount: number;
  metrics: TemplateMetric[];
}

// Body of POST /templates/:id/metrics and PATCH /templates/:id/metrics/:metricId.
export interface TemplateMetricInput {
  report_interval_sec: number;
  condition: Condition;
  threshold: number;
  consecutive_breaches: number;
  severity: Severity;
  responsible_team: string | null;
  alert_subject: string;
  alert_description: string | null;
  priority: Priority;
}
