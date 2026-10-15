-- file_descriptor_utilization is dropped: with fs.file-max effectively
-- unlimited (2^63 on modern kernels) it always reads ~0% and never alerts.
-- Only removed while nothing references it.
DELETE FROM "metrics" m
WHERE m."metric_key" = 'file_descriptor_utilization'
  AND NOT EXISTS (SELECT 1 FROM "template_metrics" t WHERE t."metric_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "target_metric_overrides" o WHERE o."metric_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "metric_readings" r WHERE r."metric_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "alerts" a WHERE a."metric_id" = m."id");
