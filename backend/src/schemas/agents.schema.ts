import { z } from "zod";

// OSes the server can build an install command for. Extend alongside the
// install scripts and agent binaries it serves. Windows has no command: its
// token is baked into the exe download (POST /agents/download/windows-x86_64).
export const supportedAgentOs = ["linux"] as const;

export const createEnrollmentTokenSchema = z.object({
  os: z.enum(supportedAgentOs),
});

export type CreateEnrollmentTokenInput = z.infer<typeof createEnrollmentTokenSchema>;
export type AgentOs = CreateEnrollmentTokenInput["os"];

export const registerAgentSchema = z.object({
  hostname: z.string().min(1),
  os: z.string().min(1).optional(),
  arch: z.string().min(1).optional(),
  // e.g. "Ubuntu 22.04 (WSL)"; older agents omit it.
  distro: z.string().trim().min(1).max(200).optional(),
});

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;