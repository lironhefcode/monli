import type { CheckResult, MetricCheck } from "~/types/targets";

// The agent picks a check up on its next poll (about once a minute), then
// collects and reports within a few seconds.
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 90_000;

interface PendingCheck {
  targetId: number;
  metricId: number;
  startedAt: number;
  onDone: (result: CheckResult[]) => void;
  onTimeout: () => void;
}

// Shared by every page, so a check keeps running across navigation.
const pending = reactive(new Map<string, PendingCheck>());
let timer: ReturnType<typeof setInterval> | undefined;

function checkKey(targetId: number, metricId: number) {
  return `${targetId}:${metricId}`;
}

// A check is done once the server lists its result. One the server no longer
// lists at all was lost (e.g. an API restart), so it ends like a timeout.
async function pollPending() {
  for (const [key, check] of pending) {
    if (Date.now() - check.startedAt > TIMEOUT_MS) {
      pending.delete(key);
      check.onTimeout();
    }
  }
  const targetIds = new Set([...pending.values()].map((check) => check.targetId));
  if (!document.hidden) {
    await Promise.all(
      [...targetIds].map(async (targetId) => {
        // A failed request is just retried on the next tick.
        const checks = await $fetch<MetricCheck[]>(`/api/targets/${targetId}/checks`).catch(() => null);
        if (!checks) return;
        const byMetricId = new Map(checks.map((check) => [check.metricId, check]));
        for (const [key, check] of pending) {
          if (check.targetId !== targetId) continue;
          const server = byMetricId.get(check.metricId);
          if (server?.result) {
            pending.delete(key);
            check.onDone(server.result);
          } else if (!server) {
            pending.delete(key);
            check.onTimeout();
          }
        }
      })
    );
  }
  if (pending.size === 0) {
    clearInterval(timer);
    timer = undefined;
  }
}

// "Check now": asks a resource's agent for a fresh reading of one metric
// instead of waiting for its interval, and reports when it arrives.
export function useMetricCheck() {
  const toast = useToast();

  async function check(targetId: number, metricId: number, onDone: (result: CheckResult[]) => void) {
    const key = checkKey(targetId, metricId);
    if (pending.has(key)) return;
    // Registered before the request, so the button is busy right away.
    pending.set(key, {
      targetId,
      metricId,
      startedAt: Date.now(),
      onDone,
      onTimeout: () =>
        toast.add({
          title: "No reading yet",
          description: "The agent didn't report within 90 seconds. Check that it's running.",
          color: "warning",
        }),
    });
    try {
      await $fetch(`/api/targets/${targetId}/metrics/${metricId}/check`, { method: "POST" });
    } catch (err) {
      pending.delete(key);
      toast.add({ title: "Couldn't request a check", description: apiErrorMessage(err), color: "error" });
      return;
    }
    timer ??= setInterval(pollPending, POLL_INTERVAL_MS);
  }

  function isChecking(targetId: number, metricId: number) {
    return pending.has(checkKey(targetId, metricId));
  }

  // Toast with the fresh values, coloured by the worst alert level among them.
  // It stays until the user closes it (duration 0 turns off auto-close).
  function showResult(title: string, unit: string | null, result: CheckResult[]) {
    const levels = new Set(result.map((item) => item.level));
    const color = levels.has("critical") ? "error" : levels.has("warning") ? "warning" : "success";
    const description = result.length
      ? result
          .map((item) => {
            const value = formatMetricValue(item.value, unit);
            return item.interfaceName ? `${item.interfaceName} ${value}` : value;
          })
          .join(" · ")
      : "No monitored interface reported a value.";
    toast.add({ title, description, color, duration: 0 });
  }

  return { check, isChecking, showResult };
}
