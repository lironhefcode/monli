import { env } from "../config/env";
import { prisma } from "../db/prisma";
import type { RegisterAgentInput } from "../schemas/agents.schema";
import { generateApiKey, hashApiKey } from "../utils/api-key";
import { HttpError } from "../utils/http-error";

const ENROLLMENT_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function createEnrollmentToken() {
  const token = generateApiKey();
  const expiresAt = new Date(Date.now() + ENROLLMENT_TOKEN_TTL_MS);
  await prisma.enrollmentToken.create({
    data: { tokenHash: hashApiKey(token), expiresAt },
  });

  const installCommand =
    `curl -sSL ${env.PUBLIC_API_URL}/agents/install.sh | sh -s -- ` +
    `--server ${env.PUBLIC_API_URL} --token ${token}`;

  return { token, expiresAt, serverUrl: env.PUBLIC_API_URL, installCommand };
}

export async function registerAgent(token: string, sourceIp: string, input: RegisterAgentInput) {
  const apiKey = generateApiKey();
  const now = new Date();

  const target = await prisma.$transaction(async (tx) => {
    const claimed = await tx.enrollmentToken.updateMany({
      where: { tokenHash: hashApiKey(token), usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count === 0) {
      throw new HttpError(401, "invalid or expired enrollment token");
    }

    const existing = await tx.target.findFirst({
      where: { name: input.hostname, ipAddress: sourceIp },
    });

    const target = existing
      ? await tx.target.update({
          where: { id: existing.id },
          data: {
            os: input.os,
            arch: input.arch,
            apiKeyHash: hashApiKey(apiKey),
            lastSeenAt: now,
            status: "up",
          },
          omit: { apiKeyHash: true },
        })
      : await tx.target.create({
          data: {
            name: input.hostname,
            type: "host",
            ipAddress: sourceIp,
            os: input.os,
            arch: input.arch,
            apiKeyHash: hashApiKey(apiKey),
            lastSeenAt: now,
            status: "up",
          },
          omit: { apiKeyHash: true },
        });

    await tx.enrollmentToken.update({
      where: { tokenHash: hashApiKey(token) },
      data: { targetId: target.id },
    });

    return target;
  });

  return { target, apiKey, serverUrl: env.PUBLIC_API_URL };
}