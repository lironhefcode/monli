-- AlterTable
ALTER TABLE "metrics" ADD COLUMN     "default_condition" TEXT,
ADD COLUMN     "default_priority" TEXT,
ADD COLUMN     "default_report_interval_sec" INTEGER,
ADD COLUMN     "default_severity" TEXT,
ADD COLUMN     "default_threshold" DOUBLE PRECISION;

-- Suggested defaults for the agent's built-in collectors (no-op where absent).
UPDATE "metrics" SET "default_condition" = 'gt', "default_threshold" = 90, "default_severity" = 'warning', "default_priority" = 'p3', "default_report_interval_sec" = 60 WHERE "metric_key" = 'cpu_percent';
UPDATE "metrics" SET "default_condition" = 'gt', "default_threshold" = 90, "default_severity" = 'warning', "default_priority" = 'p3', "default_report_interval_sec" = 60 WHERE "metric_key" = 'memory_used_pct';
UPDATE "metrics" SET "default_condition" = 'gt', "default_threshold" = 85, "default_severity" = 'warning', "default_priority" = 'p3', "default_report_interval_sec" = 60 WHERE "metric_key" = 'disk_used_pct';
