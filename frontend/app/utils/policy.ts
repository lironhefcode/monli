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

export function apiErrorMessage(err: unknown, fallback = "Could not reach the server") {
  // The backend's error handler responds with { error: string }.
  return (err as { data?: { error?: string } }).data?.error ?? fallback;
}
