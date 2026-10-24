import { prisma } from "../db/prisma.js";
import type { CreateWebhookInput, UpdateWebhookInput } from "../schemas/webhooks.schema.js";
import { HttpError } from "../utils/http-error.js";
import { sendTestMessage } from "./notifications.service.js";

export function listWebhooks() {
  return prisma.webhook.findMany({ orderBy: { name: "asc" } });
}

async function findWebhook(webhookId: number) {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook) {
    throw new HttpError(404, "webhook not found");
  }
  return webhook;
}

export function createWebhook(input: CreateWebhookInput) {
  const { min_priority, ...fields } = input;
  return prisma.webhook.create({ data: { ...fields, minPriority: min_priority } });
}

export async function updateWebhook(webhookId: number, input: UpdateWebhookInput) {
  await findWebhook(webhookId);
  const { min_priority, ...fields } = input;
  return prisma.webhook.update({
    where: { id: webhookId },
    data: { ...fields, minPriority: min_priority },
  });
}

export async function deleteWebhook(webhookId: number) {
  await findWebhook(webhookId);
  await prisma.webhook.delete({ where: { id: webhookId } });
}

export async function testWebhook(webhookId: number) {
  return sendTestMessage(await findWebhook(webhookId));
}
