import { z } from "zod";

export const createMetricSchema = z.object({
  metric_key: z.string().min(1),
  unit: z.string().optional(),
  description: z.string().optional(),
  default_condition: z.enum(["gt", "lt", "gte", "lte", "eq"]).optional(),
  default_threshold: z.number().optional(),
  default_severity: z.enum(["warning", "critical"]).optional(),
  default_priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
  default_report_interval_sec: z.number().int().positive().optional(),
});

export type CreateMetricInput = z.infer<typeof createMetricSchema>;
