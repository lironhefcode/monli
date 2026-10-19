-- An override is now a full copy of a metric's policy for one target: template
-- edits no longer reach it. Null thresholds mean that level is off (both null:
-- monitor only); a null team falls back to the target's team, then the template's.
ALTER TABLE "target_metric_overrides" ALTER COLUMN "report_interval_sec" SET NOT NULL;
ALTER TABLE "target_metric_overrides" ALTER COLUMN "condition" SET NOT NULL;
ALTER TABLE "target_metric_overrides" ALTER COLUMN "consecutive_breaches" SET NOT NULL;
ALTER TABLE "target_metric_overrides" ALTER COLUMN "alert_subject" SET DEFAULT '';
ALTER TABLE "target_metric_overrides" ALTER COLUMN "alert_subject" SET NOT NULL;
ALTER TABLE "target_metric_overrides" ALTER COLUMN "priority" SET NOT NULL;
