import { prisma } from "../db/prisma.js";
import { openHostDownAlert } from "../services/host-down.service.js";
import { longestReportIntervalSec } from "../services/targets.service.js";

// A target with no reading for MISSED_INTERVALS of its longest report
// interval, and never less than MIN_DOWN_AFTER_MS, is considered down.
// Readings set it back to "up" (see submitReading).
export const MIN_DOWN_AFTER_MS = 3 * 60 * 1000;
const MISSED_INTERVALS = 3;
const CHECK_INTERVAL_MS = 60 * 1000;

// TODO(maintenance mode): skip targets in maintenance once that exists.
export async function markStaleTargetsDown(now = new Date()) {
  const candidates = await prisma.target.findMany({
    where: {
      status: "up",
      lastSeenAt: { lt: new Date(now.getTime() - MIN_DOWN_AFTER_MS) },
    },
    select: { id: true, name: true, alias: true, responsibleTeam: true, lastSeenAt: true },
  });

  let count = 0;
  for (const target of candidates) {
    const downAfterMs = Math.max(
      MIN_DOWN_AFTER_MS,
      MISSED_INTERVALS * (await longestReportIntervalSec(target.id)) * 1000
    );
    if (target.lastSeenAt!.getTime() >= now.getTime() - downAfterMs) {
      continue;
    }
    // Matching lastSeenAt skips a target whose reading arrived meanwhile.
    const marked = await prisma.target.updateMany({
      where: { id: target.id, status: "up", lastSeenAt: target.lastSeenAt },
      data: { status: "down" },
    });
    if (marked.count === 1) {
      count++;
      await openHostDownAlert(target, now);
    }
  }
  if (count > 0) {
    console.log(`target-status: marked ${count} target(s) down`);
  }
}

export function startTargetStatusJob() {
  const run = () => {
    // A failed run is logged and retried on the next tick, never fatal.
    markStaleTargetsDown().catch((err: unknown) => console.error("target-status job failed", err));
  };
  run();
  return setInterval(run, CHECK_INTERVAL_MS);
}
