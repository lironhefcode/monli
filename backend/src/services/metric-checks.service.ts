import type { Level } from "../utils/alert-levels.js";

// On-demand ("check now") collection requests, kept in memory: they only
// matter for a few minutes, and the API runs as a single process. Losing
// them on restart just means the user clicks again.
//
// Lifecycle: added by the UI → delivered to the agent on its next poll →
// completed by the next reading of that metric, which the UI then shows.

// Requests (and their results) are dropped after this.
const CHECK_TIMEOUT_MS = 3 * 60_000;

// One value the check's reading brought back: one for a host-wide metric,
// one per monitored interface otherwise.
export interface CheckResult {
  interfaceName: string | null;
  value: number;
  // The alert level the value reads at; null when within thresholds.
  level: Level | null;
}

interface CheckState {
  requestedAt: Date;
  deliveredAt: Date | null;
  // Set once the reading arrived; null while waiting.
  result: CheckResult[] | null;
}

export interface MetricCheck extends CheckState {
  metricId: number;
}

// targetId → metricId → state; one request per metric, so clicking again
// just restarts it.
const checks = new Map<number, Map<number, CheckState>>();

// The target's live requests, with expired ones dropped.
function liveChecks(targetId: number): Map<number, CheckState> | undefined {
  const byMetric = checks.get(targetId);
  if (!byMetric) {
    return undefined;
  }
  const cutoff = Date.now() - CHECK_TIMEOUT_MS;
  for (const [metricId, state] of byMetric) {
    if (state.requestedAt.getTime() < cutoff) {
      byMetric.delete(metricId);
    }
  }
  if (byMetric.size === 0) {
    checks.delete(targetId);
    return undefined;
  }
  return byMetric;
}

export function addCheck(targetId: number, metricId: number): MetricCheck {
  let byMetric = checks.get(targetId);
  if (!byMetric) {
    byMetric = new Map();
    checks.set(targetId, byMetric);
  }
  const state: CheckState = { requestedAt: new Date(), deliveredAt: null, result: null };
  byMetric.set(metricId, state);
  return { metricId, ...state };
}

export function listChecks(targetId: number): MetricCheck[] {
  const byMetric = liveChecks(targetId);
  return byMetric ? [...byMetric].map(([metricId, state]) => ({ metricId, ...state })) : [];
}

// Metric ids the agent hasn't been told about yet; they are marked delivered.
export function takeUndelivered(targetId: number): number[] {
  const byMetric = liveChecks(targetId);
  if (!byMetric) {
    return [];
  }
  const now = new Date();
  const metricIds: number[] = [];
  for (const [metricId, state] of byMetric) {
    if (!state.deliveredAt) {
      state.deliveredAt = now;
      metricIds.push(metricId);
    }
  }
  return metricIds;
}

// A reading arrived. Only a delivered request is fulfilled by it: one still
// waiting for the agent's poll needs a reading taken after the request. The
// result stays until the entry expires, for the UI to pick up.
export function completeCheck(targetId: number, metricId: number, result: CheckResult[]) {
  const state = checks.get(targetId)?.get(metricId);
  if (state?.deliveredAt && !state.result) {
    state.result = result;
  }
}
