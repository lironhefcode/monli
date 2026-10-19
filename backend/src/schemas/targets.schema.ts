import { z } from "zod";

export const targetIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const targetTemplateParamsSchema = targetIdParamsSchema.extend({
  templateId: z.coerce.number().int().positive(),
});

export const targetMetricParamsSchema = targetIdParamsSchema.extend({
  metricId: z.coerce.number().int().positive(),
});

export const createTargetSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  responsible_team: z.string().optional(),
});

// Free-text label; blank (after trimming) or null clears it.
const clearableLabel = z
  .string()
  .trim()
  .max(100)
  .transform((value) => value || null)
  .nullable();

// Only fields present in the body change.
export const updateTargetSchema = z
  .object({
    alias: clearableLabel,
    responsible_team: clearableLabel,
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "at least one field is required" });

export const assignTemplateSchema = z.object({
  template_id: z.number().int().positive(),
});

// Blank (after trimming) or null stores null.
const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable();

// PUT body: the whole customized policy. Null thresholds turn a level off;
// a null team means the target's team is used.
export const overrideSchema = z.object({
  report_interval_sec: z.number().int().positive(),
  condition: z.enum(["gt", "lt", "gte", "lte", "eq"]),
  warning_threshold: z.number().nullable(),
  critical_threshold: z.number().nullable(),
  consecutive_breaches: z.number().int().positive(),
  responsible_team: optionalText,
  alert_subject: z.string().trim(),
  alert_description: optionalText,
  priority: z.enum(["p1", "p2", "p3", "p4"]),
});

export const submitReadingSchema = z.object({
  metric_key: z.string().min(1),
  value: z.number(),
  recorded_at: z.string().datetime().optional(),
});

export const historyRanges = ["1h", "6h", "24h", "7d"] as const;

export const historyQuerySchema = z.object({
  range: z.enum(historyRanges).default("1h"),
});

export type TargetIdParams = z.infer<typeof targetIdParamsSchema>;
export type TargetTemplateParams = z.infer<typeof targetTemplateParamsSchema>;
export type TargetMetricParams = z.infer<typeof targetMetricParamsSchema>;
export type CreateTargetInput = z.infer<typeof createTargetSchema>;
export type UpdateTargetInput = z.infer<typeof updateTargetSchema>;
export type AssignTemplateInput = z.infer<typeof assignTemplateSchema>;
export type OverrideInput = z.infer<typeof overrideSchema>;
export type SubmitReadingInput = z.infer<typeof submitReadingSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type HistoryRange = (typeof historyRanges)[number];
