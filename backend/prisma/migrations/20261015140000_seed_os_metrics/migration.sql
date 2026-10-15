-- OS-level agent collectors (agent/src/collectors/mod.rs). Defaults follow
-- common monitoring-tool templates; NULL condition/thresholds mean no
-- suggested rule (collected for charts, rule set per template if wanted).
-- Existing rows are left untouched.
INSERT INTO "metrics" ("metric_key", "unit", "description", "default_condition", "default_warning_threshold", "default_critical_threshold", "default_priority", "default_report_interval_sec")
VALUES
  ('swap_utilization', '%', 'Swap used (0% when the host has no swap)', 'gt', 50, 80, 'p3', 60),
  ('load_per_core_1m', NULL, 'Load average over 1 minute, per CPU core', NULL, NULL, NULL, 'p3', 60),
  ('load_per_core_5m', NULL, 'Load average over 5 minutes, per CPU core', 'gt', 1.5, 3, 'p3', 60),
  ('load_per_core_15m', NULL, 'Load average over 15 minutes, per CPU core', 'gt', 1, 2, 'p3', 60),
  ('process_count', NULL, 'Running processes', NULL, NULL, NULL, 'p3', 60),
  ('process_zombie_count', NULL, 'Zombie processes (exited, not collected by their parent)', 'gt', 5, 20, 'p3', 60),
  ('system_uptime', 's', 'Seconds since boot (low means the host restarted)', 'lt', 600, NULL, 'p3', 60),
  ('network_receive_rate', 'B/s', 'Bytes received per second, all interfaces except loopback', NULL, NULL, NULL, 'p3', 60),
  ('network_transmit_rate', 'B/s', 'Bytes sent per second, all interfaces except loopback', NULL, NULL, NULL, 'p3', 60),
  ('network_error_rate', 'errors/s', 'Receive and transmit errors per second, all interfaces', 'gt', 2, NULL, 'p3', 60),
  ('disk_read_rate', 'B/s', 'Bytes read per second, all physical disks', NULL, NULL, NULL, 'p3', 60),
  ('disk_write_rate', 'B/s', 'Bytes written per second, all physical disks', NULL, NULL, NULL, 'p3', 60),
  ('cpu_iowait', '%', 'CPU time idle while waiting for I/O', 'gt', 20, 40, 'p3', 60),
  ('cpu_steal', '%', 'CPU time taken by the hypervisor for other VMs', 'gt', 10, 20, 'p3', 60),
  ('disk_inode_utilization', '%', 'Inodes used on the root filesystem', 'gt', 80, 90, 'p3', 60),
  ('file_descriptor_utilization', '%', 'Open file handles, % of the system-wide limit', 'gt', 80, 90, 'p3', 60),
  ('tcp_established_count', NULL, 'Established TCP connections (IPv4 and IPv6)', NULL, NULL, NULL, 'p3', 60),
  ('swap_paging_rate', 'pages/s', 'Pages swapped in plus out per second', NULL, NULL, NULL, 'p3', 60)
ON CONFLICT ("metric_key") DO NOTHING;
