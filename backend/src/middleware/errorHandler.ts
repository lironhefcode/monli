import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Never echo internal error details (Prisma/DB/stack info) to clients.
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
}
