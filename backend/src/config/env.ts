import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PUBLIC_API_URL: z.string().url("PUBLIC_API_URL must be a valid URL"),
  TRUST_PROXY: z.string().min(1).optional(),
  // Signs session cookies; anyone who has it can forge a login.
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // Extra browser origins allowed to sign in, comma-separated (e.g. the
  // frontend dev server). The origin of PUBLIC_API_URL is always allowed.
  AUTH_TRUSTED_ORIGINS: z
    .string()
    .optional()
    .transform((value) => (value ?? "").split(",").map((origin) => origin.trim()).filter(Boolean)),
});

export const env = envSchema.parse(process.env);
