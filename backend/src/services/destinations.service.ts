import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  urlKindError,
  type CreateDestinationInput,
  type UpdateDestinationInput,
  type WebhookKind,
} from "../schemas/notifications.schema.js";
import { HttpError } from "../utils/http-error.js";
import { open, seal } from "../utils/secret-box.js";
import { destinationWithRecipients, sendTestMessage } from "./notifications.service.js";

const destinationRow = {
  include: { recipients: { select: { userId: true } }, _count: { select: { rules: true } } },
} satisfies Prisma.NotificationDestinationDefaultArgs;

type DestinationRow = Prisma.NotificationDestinationGetPayload<typeof destinationRow>;

// The URL embeds a secret token, so only its host leaves the server; null when
// it can't be decrypted any more (the UI then asks for it again).
function urlHost(url: string | null) {
  if (url === null) return null;
  try {
    return new URL(open(url)).host;
  } catch {
    return null;
  }
}

function toRow({ url, recipients, _count, ...destination }: DestinationRow) {
  return {
    ...destination,
    urlHost: urlHost(url),
    userIds: recipients.map((recipient) => recipient.userId),
    ruleCount: _count.rules,
  };
}

export async function listDestinations() {
  const destinations = await prisma.notificationDestination.findMany({ ...destinationRow, orderBy: { name: "asc" } });
  return destinations.map(toRow);
}

// args picks what is loaded with it (e.g. destinationRow).
async function findDestination<Args extends Prisma.NotificationDestinationDefaultArgs>(
  destinationId: number,
  args: Args
) {
  const destination = await prisma.notificationDestination.findUnique({ ...args, where: { id: destinationId } });
  if (!destination) {
    throw new HttpError(404, "destination not found");
  }
  return destination as Prisma.NotificationDestinationGetPayload<Args>;
}

async function checkRecipients(emailAddresses: string[], userIds: string[]) {
  if (emailAddresses.length + userIds.length === 0) throw new HttpError(400, "add at least one recipient");
  const found = await prisma.user.count({ where: { id: { in: userIds } } });
  if (found !== new Set(userIds).size) throw new HttpError(400, "unknown user in recipients");
}

const recipientRows = (userIds: string[]) => [...new Set(userIds)].map((userId) => ({ userId }));

function checkUrl(kind: WebhookKind, url: string) {
  const message = urlKindError(kind, url);
  if (message) throw new HttpError(400, message);
}

export async function createDestination(input: CreateDestinationInput) {
  if (input.kind !== "email") {
    const { url, ...fields } = input;
    checkUrl(fields.kind, url);
    return toRow(await prisma.notificationDestination.create({ ...destinationRow, data: { ...fields, url: seal(url) } }));
  }
  const { email_addresses, user_ids, ...fields } = input;
  await checkRecipients(email_addresses, user_ids);
  const destination = await prisma.notificationDestination.create({
    ...destinationRow,
    data: { ...fields, emailAddresses: email_addresses, recipients: { create: recipientRows(user_ids) } },
  });
  return toRow(destination);
}

// kind is fixed; fields that belong to the other kind are refused.
export async function updateDestination(destinationId: number, input: UpdateDestinationInput) {
  const saved = await findDestination(destinationId, destinationRow);
  const { name, url, email_addresses, user_ids } = input;
  const isEmail = saved.kind === "email";
  if (isEmail && url !== undefined) throw new HttpError(400, "email destinations have no URL");
  if (!isEmail && (email_addresses !== undefined || user_ids !== undefined)) {
    throw new HttpError(400, "only email destinations have recipients");
  }

  if (!isEmail && url !== undefined) checkUrl(saved.kind as WebhookKind, url);
  if (isEmail && (email_addresses !== undefined || user_ids !== undefined)) {
    await checkRecipients(
      email_addresses ?? saved.emailAddresses,
      user_ids ?? saved.recipients.map((recipient) => recipient.userId)
    );
  }
  const destination = await prisma.notificationDestination.update({
    ...destinationRow,
    where: { id: destinationId },
    data: {
      name,
      url: url === undefined ? undefined : seal(url),
      emailAddresses: email_addresses,
      recipients: user_ids === undefined ? undefined : { deleteMany: {}, create: recipientRows(user_ids) },
    },
  });
  return toRow(destination);
}

// Refused while rules send to it, so no rule is left silently sending nowhere.
export async function deleteDestination(destinationId: number) {
  await findDestination(destinationId, { select: { id: true } });
  const rules = await prisma.notificationRule.findMany({
    where: { destinations: { some: { destinationId } } },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  if (rules.length > 0) {
    throw new HttpError(409, `used by ${rules.map((rule) => rule.name).join(", ")}; remove it from those rules first`);
  }
  await prisma.notificationDestination.delete({ where: { id: destinationId } });
}

export async function testDestination(destinationId: number) {
  return sendTestMessage(await findDestination(destinationId, destinationWithRecipients));
}
