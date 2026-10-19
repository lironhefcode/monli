import { prisma } from "../db/prisma.js";

// A target with no reading for this long is considered down. Readings set it
// back to "up" (see submitReading).
export const TARGET_DOWN_AFTER_MS = 3 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

// Stored rather than computed at read time so "host down" can drive alerts later.
export async function markStaleTargetsDown(now = new Date()) {
  const { count } = await prisma.target.updateMany({
    where: {
      status: "up",
      lastSeenAt: { lt: new Date(now.getTime() - TARGET_DOWN_AFTER_MS) },
    },
    data: { status: "down" },
  });
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
