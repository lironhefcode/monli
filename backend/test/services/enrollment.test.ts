import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { createEnrollmentToken, registerAgent } from "../../src/services/agents.service.js";
import { generateApiKey, hashApiKey, verifyApiKey } from "../../src/utils/api-key.js";
import { resetDb } from "../helpers/db.js";

const agent = { hostname: "web-1", os: "linux", arch: "x86_64", distro: "Ubuntu 24.04" };

async function newToken() {
  return (await createEnrollmentToken("linux")).token;
}

beforeEach(resetDb);

describe("createEnrollmentToken", () => {
  it("stores only the token's hash, valid for an hour, and builds the install command", async () => {
    const before = Date.now();
    const { token, expiresAt, installCommand } = await createEnrollmentToken("linux");

    const stored = await prisma.enrollmentToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashApiKey(token));
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
    expect(installCommand).toContain(`--token ${token}`);
    expect(installCommand).toContain("--server http://localhost:3000");
  });
});

describe("registerAgent", () => {
  it("creates an up host target with a working API key", async () => {
    const { target, apiKey } = await registerAgent(await newToken(), "10.0.0.5", agent);

    expect(target).toMatchObject({
      name: "web-1",
      type: "host",
      ipAddress: "10.0.0.5",
      os: "linux",
      arch: "x86_64",
      distro: "Ubuntu 24.04",
      status: "up",
    });
    expect(target).not.toHaveProperty("apiKeyHash");
    const stored = await prisma.target.findUniqueOrThrow({ where: { id: target.id } });
    expect(verifyApiKey(apiKey, stored.apiKeyHash)).toBe(true);
  });

  it("marks the token used and links it to the target", async () => {
    const token = await newToken();
    const { target } = await registerAgent(token, "10.0.0.5", agent);

    const stored = await prisma.enrollmentToken.findUniqueOrThrow({ where: { tokenHash: hashApiKey(token) } });
    expect(stored.usedAt).not.toBeNull();
    expect(stored.targetId).toBe(target.id);
  });

  it("accepts a token only once", async () => {
    const token = await newToken();
    await registerAgent(token, "10.0.0.5", agent);

    await expect(registerAgent(token, "10.0.0.5", agent)).rejects.toMatchObject({ status: 401 });
    expect(await prisma.target.count()).toBe(1);
  });

  it("refuses an expired token", async () => {
    const token = generateApiKey();
    await prisma.enrollmentToken.create({
      data: { tokenHash: hashApiKey(token), expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(registerAgent(token, "10.0.0.5", agent)).rejects.toMatchObject({ status: 401 });
    expect(await prisma.target.count()).toBe(0);
  });

  it("refuses an unknown token", async () => {
    await expect(registerAgent(generateApiKey(), "10.0.0.5", agent)).rejects.toMatchObject({ status: 401 });
  });

  it("re-binds the same hostname and IP to the existing target, replacing its key", async () => {
    const first = await registerAgent(await newToken(), "10.0.0.5", agent);
    const second = await registerAgent(await newToken(), "10.0.0.5", { ...agent, distro: "Ubuntu 26.04" });

    expect(second.target.id).toBe(first.target.id);
    expect(second.target.distro).toBe("Ubuntu 26.04");
    expect(await prisma.target.count()).toBe(1);

    const stored = await prisma.target.findUniqueOrThrow({ where: { id: first.target.id } });
    expect(verifyApiKey(second.apiKey, stored.apiKeyHash)).toBe(true);
    expect(verifyApiKey(first.apiKey, stored.apiKeyHash)).toBe(false);
  });

  it("creates a new target for the same hostname from another IP", async () => {
    const first = await registerAgent(await newToken(), "10.0.0.5", agent);
    const second = await registerAgent(await newToken(), "10.0.0.6", agent);

    expect(second.target.id).not.toBe(first.target.id);
    expect(await prisma.target.count()).toBe(2);
  });

  it("creates a new target for another hostname from the same IP", async () => {
    const first = await registerAgent(await newToken(), "10.0.0.5", agent);
    const second = await registerAgent(await newToken(), "10.0.0.5", { ...agent, hostname: "web-2" });

    expect(second.target.id).not.toBe(first.target.id);
  });
});
