import { HttpError } from "./http-error.js";

export type Condition = "gt" | "gte" | "lt" | "lte" | "eq";
export type Level = "warning" | "critical";

export function breaches(value: number, condition: string, threshold: number): boolean {
  switch (condition) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold;
    default:
      return false;
  }
}

// Critical wins over warning; null means the reading is healthy.
export function levelOf(
  value: number,
  condition: string,
  warningThreshold: number | null,
  criticalThreshold: number | null
): Level | null {
  if (criticalThreshold !== null && breaches(value, condition, criticalThreshold)) return "critical";
  if (warningThreshold !== null && breaches(value, condition, warningThreshold)) return "warning";
  return null;
}

// Both levels empty is allowed (monitor only: no alerts). With both set,
// warning must trip before critical (lower for > / ≥, higher for < / ≤) so
// critical stays reachable.
export function assertValidThresholds(
  condition: string,
  warningThreshold: number | null,
  criticalThreshold: number | null
) {
  if (warningThreshold === null || criticalThreshold === null) return;
  if ((condition === "gt" || condition === "gte") && warningThreshold >= criticalThreshold) {
    throw new HttpError(422, "warning threshold must be lower than critical threshold");
  }
  if ((condition === "lt" || condition === "lte") && warningThreshold <= criticalThreshold) {
    throw new HttpError(422, "warning threshold must be higher than critical threshold");
  }
}

// Used whenever a policy's alert subject is left empty.
export const DEFAULT_ALERT_SUBJECT =
  "{{metric}} on {{host}} is {{value}}{{unit}} ({{severity}} threshold {{threshold}}{{unit}})";

export interface MessageContext {
  metric: string;
  host: string;
  value: number;
  unit: string | null;
  severity: Level;
  threshold: number;
}

function formatNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

// Replaces {{name}} placeholders; unknown names are left as written.
export function renderMessage(template: string, context: MessageContext): string {
  const values: Record<string, string> = {
    metric: context.metric,
    host: context.host,
    value: formatNumber(context.value),
    unit: context.unit ?? "",
    severity: context.severity,
    threshold: formatNumber(context.threshold),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => values[name] ?? match);
}
