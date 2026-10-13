-- Built-in agent collectors (agent/src/collectors/mod.rs). Seeded so a fresh
-- install has metrics to put in templates; existing rows are left untouched.
INSERT INTO "metrics" ("metric_key", "unit", "description", "default_condition", "default_threshold", "default_severity", "default_priority", "default_report_interval_sec")
VALUES
  ('cpu_percent', '%', 'CPU utilisation', 'gt', 90, 'warning', 'p3', 60),
  ('memory_used_pct', '%', 'Memory used', 'gt', 90, 'warning', 'p3', 60),
  ('disk_used_pct', '%', 'Root disk used', 'gt', 85, 'warning', 'p3', 60)
ON CONFLICT ("metric_key") DO NOTHING;
