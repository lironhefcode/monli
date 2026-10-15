-- Rename the built-in metric keys. Rows keep their ids, so templates, readings
-- and alerts stay attached. Agents built before this rename only know the old
-- keys and must be reinstalled (agent/src/collectors/mod.rs).
UPDATE "metrics" SET "metric_key" = 'cpu_utilization', "description" = 'CPU utilization' WHERE "metric_key" = 'cpu_percent';
UPDATE "metrics" SET "metric_key" = 'memory_utilization', "description" = 'Memory utilization' WHERE "metric_key" = 'memory_used_pct';
UPDATE "metrics" SET "metric_key" = 'disk_utilization', "description" = 'Disk utilization (root)' WHERE "metric_key" = 'disk_used_pct';
