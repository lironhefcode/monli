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
  threshold: z.number(),
  consecutive_breaches: z.number().int().positive().default(1),
  severity: z.enum(["warning", "critical"]).default("warning"),
  responsible_team: z.string().optional(),
  alert_subject: z.string().default(""),
  alert_description: z.string().optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).default("p3"),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type AddTemplateMetricInput = z.infer<typeof addTemplateMetricSchema>;
