import { z } from "zod";

export const webhookKinds = ["discord", "slack", "generic"] as const;

export const webhookIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Blank (after trimming) or null stores null.
const optionalTeam = z
  .string()
  .trim()
  .max(100)
  .transform((value) => value || null)
  .nullable();

const webhookFields = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(webhookKinds),
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:$/.test(new URL(value).protocol), { message: "URL must use http or https" }),
  enabled: z.boolean(),
  team: optionalTeam,
  // Alerts at this priority or higher pass; null passes every priority.
  min_priority: z.enum(["p1", "p2", "p3", "p4"]).nullable(),
});

export const createWebhookSchema = webhookFields.extend({
  enabled: z.boolean().default(true),
  team: optionalTeam.default(null),
  min_priority: webhookFields.shape.min_priority.default(null),
});

// Only fields present in the body change.
export const updateWebhookSchema = webhookFields
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "at least one field is required" });

export type WebhookKind = (typeof webhookKinds)[number];
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
