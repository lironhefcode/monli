import { z } from "zod";

export const targetIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const targetTemplateParamsSchema = targetIdParamsSchema.extend({
  templateId: z.coerce.number().int().positive(),
});

export const createTargetSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  ip_address: z.string().optional(),
  description: z.string().optional(),
  responsible_team: z.string().optional(),
});

export const assignTemplateSchema = z.object({
  template_id: z.number().int().positive(),
});

export const overrideSchema = z.object({
  report_interval_sec: z.number().int().positive().optional(),
  condition: z.enum(["gt", "lt", "gte", "lte", "eq"]).optional(),
  threshold: z.number().optional(),
  consecutive_breaches: z.number().int().positive().optional(),
  severity: z.enum(["warning", "critical"]).optional(),
  responsible_team: z.string().optional(),
  alert_subject: z.string().optional(),
  alert_description: z.string().optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
});

export const submitReadingSchema = z.object({
  metric_key: z.string().min(1),
  value: z.number(),
  recorded_at: z.string().datetime().optional(),
});

export type CreateTargetInput = z.infer<typeof createTargetSchema>;
export type AssignTemplateInput = z.infer<typeof assignTemplateSchema>;
export type OverrideInput = z.infer<typeof overrideSchema>;
export type SubmitReadingInput = z.infer<typeof submitReadingSchema>;
