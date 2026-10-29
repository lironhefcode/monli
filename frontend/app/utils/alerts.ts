import type { Alert } from "~/types/alerts";

// The backend's built-in metric that host-down alerts open against.
export const HOST_UP_METRIC_KEY = "host_up";

// Opened when a resource stops reporting; the next reading resolves it.
export function isHostDown(alert: Alert) {
  return alert.metric.metricKey === HOST_UP_METRIC_KEY;
}
