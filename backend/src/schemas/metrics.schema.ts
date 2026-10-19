import { z } from "zod";

export const createMetricSchema = z.object({
  metric_key: z.string().min(1),
  unit: z.string().optional(),
  description: z.string().optional(),
  default_condition: z.enum(["gt", "lt", "gte", "lte", "eq"]).optional(),
  default_warning_threshold: z.number().optional(),
  default_critical_threshold: z.number().optional(),
  default_priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
  default_report_interval_sec: z.number().int().positive().optional(),
});

export const metricIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Catalog defaults only pre-fill metrics added to templates later; existing
// template metrics keep their own copies. null clears a field.
export const updateMetricDefaultsSchema = z
  .object({
    default_condition: z.enum(["gt", "lt", "gte", "lte", "eq"]),
    default_warning_threshold: z.number().nullable(),
    default_critical_threshold: z.number().nullable(),
    default_priority: z.enum(["p1", "p2", "p3", "p4"]),
    // Blank means the built-in default subject.
    default_alert_subject: z
      .string()
      .trim()
      .max(500)
      .transform((value) => value || null)
      .nullable(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "at least one field is required" });

export type CreateMetricInput = z.infer<typeof createMetricSchema>;
export type UpdateMetricDefaultsInput = z.infer<typeof updateMetricDefaultsSchema>;
