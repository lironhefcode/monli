import { prisma } from "../db/prisma.js";
import type { EmailServerInput } from "../schemas/notifications.schema.js";
import { HttpError } from "../utils/http-error.js";
import { seal } from "../utils/secret-box.js";

const SERVER_ID = 1;

export function loadEmailServer() {
  return prisma.emailServer.findUnique({ where: { id: SERVER_ID } });
}

// The password never leaves the server; the UI only learns whether one is saved.
export async function getEmailServer() {
  const server = await loadEmailServer();
  if (!server) return { configured: false as const };
  const { host, port, security, username, password, fromAddress, updatedAt } = server;
  return {
    configured: true as const,
    host,
    port,
    security,
    username,
    fromAddress,
    updatedAt,
    hasPassword: password !== null,
  };
}

export async function saveEmailServer(input: EmailServerInput) {
  const { password, from, ...fields } = input;
  let storedPassword: string | null = password === undefined ? null : seal(password);

  if (password === undefined && fields.username !== null) {
    // Keeping the saved password is only allowed for the same server, account
    // and security, so it can't be sent to a server an admin just typed in, or
    // in the clear after a switch to "none".
    const saved = await loadEmailServer();
    const sameAccount =
      saved !== null &&
      saved.password !== null &&
      saved.host === fields.host &&
      saved.port === fields.port &&
      saved.username === fields.username &&
      saved.security === fields.security;
    if (!sameAccount) throw new HttpError(400, "enter the SMTP password");
    storedPassword = saved.password;
  }

  // No username: the server takes mail without signing in, so no password either.
  const data = { ...fields, password: fields.username === null ? null : storedPassword, fromAddress: from };
  await prisma.emailServer.upsert({ where: { id: SERVER_ID }, create: { id: SERVER_ID, ...data }, update: data });
  return getEmailServer();
}

// Email destinations stay, but fail to send until a server is set up again.
export async function deleteEmailServer() {
  await prisma.emailServer.deleteMany({ where: { id: SERVER_ID } });
}
