import type { Prisma } from "@prisma/client";
import { auth } from "../auth/auth.js";
import { prisma } from "./prisma.js";

// First-run admin, documented in the README. Created only while there are no
// users at all, so deleting it later doesn't bring it back on restart.
const defaultAdmin = { name: "Admin", email: "admin@monli.local", password: "monliadmin" };

// Built-in catalog metrics, one per agent collector. Only metrics whose
// metric_key is missing are inserted, so edited defaults are never overwritten.
// Runs on every API start (Dockerfile) and after `prisma migrate reset`.
const builtinMetrics: Prisma.MetricCreateManyInput[] = [
  { metricKey: "cpu_utilization", unit: "%", description: "CPU utilization", defaultCondition: "gt", defaultWarningThreshold: 90 },
  { metricKey: "memory_utilization", unit: "%", description: "Memory utilization", defaultCondition: "gt", defaultWarningThreshold: 90 },
  { metricKey: "disk_utilization", deviceKind: "filesystem", unit: "%", description: "Disk space used, per mounted filesystem", defaultCondition: "gt", defaultWarningThreshold: 85 },
  { metricKey: "swap_utilization", unit: "%", description: "Swap used (0% when the host has no swap)", defaultCondition: "gt", defaultWarningThreshold: 50, defaultCriticalThreshold: 80 },
  { metricKey: "load_per_core_1m", description: "Load average over 1 minute, per CPU core" },
  { metricKey: "load_per_core_5m", description: "Load average over 5 minutes, per CPU core", defaultCondition: "gt", defaultWarningThreshold: 1.5, defaultCriticalThreshold: 3 },
  { metricKey: "load_per_core_15m", description: "Load average over 15 minutes, per CPU core", defaultCondition: "gt", defaultWarningThreshold: 1, defaultCriticalThreshold: 2 },
  { metricKey: "process_count", description: "Running processes" },
  { metricKey: "process_zombie_count", description: "Zombie processes (exited, not collected by their parent)", defaultCondition: "gt", defaultWarningThreshold: 5, defaultCriticalThreshold: 20 },
  { metricKey: "system_uptime", unit: "s", description: "Seconds since boot (low means the host restarted)", defaultCondition: "lt", defaultWarningThreshold: 600 },
  { metricKey: "network_receive_rate", deviceKind: "network", unit: "B/s", description: "Bytes received per second, per network interface" },
  { metricKey: "network_transmit_rate", deviceKind: "network", unit: "B/s", description: "Bytes sent per second, per network interface" },
  { metricKey: "network_error_rate", deviceKind: "network", unit: "errors/s", description: "Receive and transmit errors per second, per network interface", defaultCondition: "gt", defaultWarningThreshold: 2 },
  { metricKey: "disk_read_rate", deviceKind: "disk", unit: "B/s", description: "Bytes read per second, per physical disk" },
  { metricKey: "disk_write_rate", deviceKind: "disk", unit: "B/s", description: "Bytes written per second, per physical disk" },
  { metricKey: "cpu_iowait", unit: "%", description: "CPU time idle while waiting for I/O", defaultCondition: "gt", defaultWarningThreshold: 20, defaultCriticalThreshold: 40 },
  { metricKey: "cpu_steal", unit: "%", description: "CPU time taken by the hypervisor for other VMs", defaultCondition: "gt", defaultWarningThreshold: 10, defaultCriticalThreshold: 20 },
  { metricKey: "disk_inode_utilization", deviceKind: "filesystem", unit: "%", description: "Inodes used, per mounted filesystem", defaultCondition: "gt", defaultWarningThreshold: 80, defaultCriticalThreshold: 90 },
  { metricKey: "tcp_established_count", description: "Established TCP connections (IPv4 and IPv6)" },
  { metricKey: "swap_paging_rate", unit: "pages/s", description: "Pages swapped in plus out per second" },
];

async function main() {
  // Every built-in metric is p3, reported every 60s, with the default subject.
  const { count } = await prisma.metric.createMany({
    data: builtinMetrics.map((metric) => ({ defaultPriority: "p3", defaultReportIntervalSec: 60, ...metric })),
    skipDuplicates: true,
  });
  console.log(`seed: inserted ${count} of ${builtinMetrics.length} built-in metrics`);

  if ((await prisma.user.count()) === 0) {
    await auth.api.createUser({ body: { ...defaultAdmin, role: "admin" } });
    console.log(`seed: created the default admin ${defaultAdmin.email}`);
  }
}

main()
  .catch((err) => {
    console.error("seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
