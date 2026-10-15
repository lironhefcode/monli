-- One condition with a warning and a critical threshold, replacing the single
-- threshold + severity pair. Existing thresholds move to the level their
-- severity named.

-- template_metrics
ALTER TABLE "template_metrics" ADD COLUMN "warning_threshold" DOUBLE PRECISION,
ADD COLUMN "critical_threshold" DOUBLE PRECISION;
UPDATE "template_metrics" SET "critical_threshold" = "threshold" WHERE "severity" = 'critical';
UPDATE "template_metrics" SET "warning_threshold" = "threshold" WHERE "severity" <> 'critical';
ALTER TABLE "template_metrics" DROP COLUMN "threshold",
DROP COLUMN "severity";

-- target_metric_overrides (an override without a threshold keeps neither level)
ALTER TABLE "target_metric_overrides" ADD COLUMN "warning_threshold" DOUBLE PRECISION,
ADD COLUMN "critical_threshold" DOUBLE PRECISION;
UPDATE "target_metric_overrides" SET "critical_threshold" = "threshold" WHERE "threshold" IS NOT NULL AND "severity" = 'critical';
UPDATE "target_metric_overrides" SET "warning_threshold" = "threshold" WHERE "threshold" IS NOT NULL AND ("severity" IS NULL OR "severity" <> 'critical');
ALTER TABLE "target_metric_overrides" DROP COLUMN "threshold",
DROP COLUMN "severity";

-- metrics catalog defaults
ALTER TABLE "metrics" ADD COLUMN "default_warning_threshold" DOUBLE PRECISION,
ADD COLUMN "default_critical_threshold" DOUBLE PRECISION;
UPDATE "metrics" SET "default_critical_threshold" = "default_threshold" WHERE "default_threshold" IS NOT NULL AND "default_severity" = 'critical';
UPDATE "metrics" SET "default_warning_threshold" = "default_threshold" WHERE "default_threshold" IS NOT NULL AND ("default_severity" IS NULL OR "default_severity" <> 'critical');
ALTER TABLE "metrics" DROP COLUMN "default_threshold",
DROP COLUMN "default_severity";

-- alerts: latest value while open
ALTER TABLE "alerts" ADD COLUMN "last_value" DOUBLE PRECISION,
ADD COLUMN "last_value_at" TIMESTAMP(3);
UPDATE "alerts" SET "last_value" = "triggered_value", "last_value_at" = "opened_at";
