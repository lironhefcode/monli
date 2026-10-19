const conditionSymbols = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
} as const;

export const conditionOptions = [
  { label: "> greater than", value: "gt" },
  { label: "≥ at least", value: "gte" },
  { label: "< less than", value: "lt" },
  { label: "≤ at most", value: "lte" },
  { label: "= equal to", value: "eq" },
] as const;

// "> 90 %"
export function formatRule(condition: keyof typeof conditionSymbols, threshold: number, unit: string | null) {
  return `${conditionSymbols[condition]} ${threshold}${unit ? ` ${unit}` : ""}`;
}

// Both levels of a policy, e.g. [{ level: "warning", rule: "> 80 %" }, ...].
export function formatLevels(
  condition: keyof typeof conditionSymbols,
  warningThreshold: number | null,
  criticalThreshold: number | null,
  unit: string | null
) {
  const levels: { level: "warning" | "critical"; rule: string }[] = [];
  if (warningThreshold !== null) levels.push({ level: "warning", rule: formatRule(condition, warningThreshold, unit) });
  if (criticalThreshold !== null) levels.push({ level: "critical", rule: formatRule(condition, criticalThreshold, unit) });
  return levels;
}

// Mirrors the API's threshold rule so problems show before saving. A level that
// is on but has no number is an error; both levels off means monitor only.
export function thresholdProblem(
  condition: keyof typeof conditionSymbols,
  warningOn: boolean,
  warning: number | null,
  criticalOn: boolean,
  critical: number | null
) {
  if (warningOn && warning === null) return "Enter a warning threshold.";
  if (criticalOn && critical === null) return "Enter a critical threshold.";
  if (warning === null || critical === null) return null;
  if ((condition === "gt" || condition === "gte") && warning >= critical) {
    return "Warning must be lower than critical.";
  }
  if ((condition === "lt" || condition === "lte") && warning <= critical) {
    return "Warning must be higher than critical.";
  }
  return null;
}

// Threshold inputs hold "" while empty.
export function toThreshold(value: number | ""): number | null {
  return value === "" || !Number.isFinite(value) ? null : value;
}

// Mirrors DEFAULT_ALERT_SUBJECT in backend/src/utils/alert-levels.ts.
export const defaultAlertSubject =
  "{{metric}} on {{host}} is {{value}}{{unit}} ({{severity}} threshold {{threshold}}{{unit}})";

export function apiErrorMessage(err: unknown, fallback = "Could not reach the server") {
  // The backend's error handler responds with { error: string }.
  return (err as { data?: { error?: string } }).data?.error ?? fallback;
}
