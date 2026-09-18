import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PUBLIC_API_URL: z.string().url("PUBLIC_API_URL must be a valid URL"),
  TRUST_PROXY: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
