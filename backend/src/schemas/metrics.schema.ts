import { z } from "zod";

export const createMetricSchema = z.object({
  metric_key: z.string().min(1),
  unit: z.string().optional(),
  description: z.string().optional(),
});

export type CreateMetricInput = z.infer<typeof createMetricSchema>;
