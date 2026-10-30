import { z } from "zod";

export const alertIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// A query key given once arrives as a string, repeated as an array; always an array here.
function oneOrMany<T extends z.ZodTypeAny>(item: T) {
  return z.union([item, z.array(item)]).transform((value): z.infer<T>[] => (Array.isArray(value) ? value : [value]));
}

export const listAlertsQuerySchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  // "true"/"false" in the query string; z.coerce.boolean would read "false" as true.
  acknowledged: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  // One or several (?team=a&team=b); an alert matching any of them is listed.
  team: oneOrMany(z.string()).optional(),
  priority: oneOrMany(z.enum(["p1", "p2", "p3", "p4"])).optional(),
  severity: z.enum(["warning", "critical"]).optional(),
  targetId: z.coerce.number().int().positive().optional(),
  // Range on openedAt, both ends inclusive.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Every word must appear in the host, subject, description, team, metric or interface.
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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
