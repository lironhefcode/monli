import { z } from "zod";

export const alertIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listAlertsQuerySchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  team: z.string().optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
});

// Optional free text; blank (after trimming) stores null.
const optionalNote = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null)
  .nullish();

// Ack or unack; the change is recorded as a comment with the optional text.
export const updateAlertSchema = z.object({
  acknowledged: z.boolean(),
  comment: optionalNote,
});

export const resolveAlertSchema = z.object({
  note: optionalNote,
});

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;
