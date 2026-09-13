import { z } from "zod";

export const alertIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listAlertsQuerySchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  team: z.string().optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
});

export const firstResponseSchema = z.object({
  by: z.string().min(1),
  note: z.string().optional(),
});

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type FirstResponseInput = z.infer<typeof firstResponseSchema>;
