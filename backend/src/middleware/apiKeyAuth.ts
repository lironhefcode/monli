import type { NextFunction, Request, Response } from "express";

// TODO: hash the incoming `X-Api-Key` header and compare against
// targets.api_key_hash for req.params.id. Passing through unauthenticated
// for now so agent-facing routes are wired up ahead of the auth
// implementation.
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  next();
}
