import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { verifyApiKey } from "../utils/api-key";
import { HttpError } from "../utils/http-error";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  void authenticate(req).then(next).catch(next);
}

async function authenticate(req: Request): Promise<void> {
  const apiKey = req.header("x-api-key");
  if (!apiKey) {
    throw new HttpError(401, "missing X-Api-Key header");
  }

  const targetId = Number(req.params.id);
  const target = await prisma.target.findUnique({ where: { id: targetId } });
  if (!target || !verifyApiKey(apiKey, target.apiKeyHash)) {
    throw new HttpError(401, "invalid API key");
  }
}