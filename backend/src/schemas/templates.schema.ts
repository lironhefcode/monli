import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const templateIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const addTemplateMetricSchema = z.object({
  metric_id: z.number().int().positive(),
  report_interval_sec: z.number().int().positive().default(60),
  condition: z.enum(["gt", "lt", "gte", "lte", "eq"]),
  warning_threshold: z.number().nullable().default(null),
  critical_threshold: z.number().nullable().default(null),
  consecutive_breaches: z.number().int().positive().default(1),
  responsible_team: z.string().optional(),
  alert_subject: z.string().default(""),
  alert_description: z.string().optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).default("p3"),
});

export const templateMetricParamsSchema = templateIdParamsSchema.extend({
  metricId: z.coerce.number().int().positive(),
});

// Partial update of a template metric's policy; at least one field.
export const updateTemplateMetricSchema = z
  .object({
    report_interval_sec: z.number().int().positive(),
    condition: z.enum(["gt", "lt", "gte", "lte", "eq"]),
    warning_threshold: z.number().nullable(),
    critical_threshold: z.number().nullable(),
    consecutive_breaches: z.number().int().positive(),
    responsible_team: z.string().nullable(),
    alert_subject: z.string(),
    alert_description: z.string().nullable(),
    priority: z.enum(["p1", "p2", "p3", "p4"]),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "at least one field is required" });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type AddTemplateMetricInput = z.infer<typeof addTemplateMetricSchema>;
export type UpdateTemplateMetricInput = z.infer<typeof updateTemplateMetricSchema>;
