-- Suggested alert subject, pre-filled when the metric is added to a template.
-- Null means the built-in default subject.
ALTER TABLE "metrics" ADD COLUMN "default_alert_subject" TEXT;
