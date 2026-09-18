import { z } from "zod";

export const registerAgentSchema = z.object({
  hostname: z.string().min(1),
  os: z.string().min(1).optional(),
  arch: z.string().min(1).optional(),
});

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;