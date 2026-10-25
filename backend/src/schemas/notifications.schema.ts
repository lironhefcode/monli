import { z } from "zod";

export const webhookKinds = ["discord", "slack", "generic"] as const;
export const securityModes = ["tls", "starttls", "none"] as const;
const priorities = ["p1", "p2", "p3", "p4"] as const;

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const name = z.string().trim().min(1).max(100);

// canParse first: new URL throws on what canParse rejects.
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol), {
    message: "URL must be a valid http or https URL",
  });

// Discord and Slack URLs may only point at those services, so a destination
// of those kinds can't be aimed at an internal address; generic webhooks stay
// open for self-hosted endpoints.
const officialHosts: Partial<Record<WebhookKind, string[]>> = {
  discord: ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"],
  slack: ["hooks.slack.com"],
};

// Why url can't be used for kind, or null when it can.
export function urlKindError(kind: WebhookKind, url: string): string | null {
  const hosts = officialHosts[kind];
  if (!hosts) return null;
  const parsed = new URL(url);
  // Exact match; a trailing dot ("discord.com.") names the same host.
  const host = parsed.hostname.replace(/\.$/, "");
  if (parsed.protocol === "https:" && parsed.port === "" && hosts.includes(host)) return null;
  return `${kind === "discord" ? "Discord" : "Slack"} webhook URLs must start with https://${hosts[0]}/`;
}

const emailAddresses = z.array(z.string().trim().email()).max(20);
const userIds = z.array(z.string().min(1)).max(50);

// The fields depend on kind: a URL for webhooks, recipients for email. Union
// members can't carry refinements, so "at least one recipient" is checked in
// the service.
export const createDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ name, kind: z.enum(webhookKinds), url: httpUrl }),
  z.object({
    name,
    kind: z.literal("email"),
    email_addresses: emailAddresses.default([]),
    user_ids: userIds.default([]),
  }),
]);

// kind can't change; fields for the other kind are rejected in the service.
// An omitted url keeps the saved one.
export const updateDestinationSchema = z
  .object({ name, url: httpUrl, email_addresses: emailAddresses, user_ids: userIds })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "at least one field is required" });

export const createRuleSchema = z.object({
  name,
  // Empty: every team.
  teams: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  // Alerts at this priority or higher pass; null passes every priority.
  min_priority: z.enum(priorities).nullable().default(null),
  enabled: z.boolean().default(true),
  destination_ids: z.array(z.number().int().positive()).min(1, "choose at least one destination").max(50),
});

export const updateRuleSchema = z
  .object(createRuleSchema.shape)
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: "at least one field is required" });

// An address, optionally with a display name: "Monli <alerts@example.com>".
const fromAddress = /^(?:[^<>]*<[^\s<>@]+@[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+)$/;

export const emailServerSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  security: z.enum(securityModes),
  // Blank: the server takes mail without signing in.
  username: z
    .string()
    .trim()
    .max(255)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  // Omitted keeps the saved password.
  password: z.string().min(1).max(1000).optional(),
  from: z.string().trim().min(1).max(200).regex(fromAddress, "enter an address, e.g. Monli <alerts@example.com>"),
});

export type WebhookKind = (typeof webhookKinds)[number];
export type DestinationKind = WebhookKind | "email";
export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
export type UpdateDestinationInput = z.infer<typeof updateDestinationSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type EmailServerInput = z.infer<typeof emailServerSchema>;
