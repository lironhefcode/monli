import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

type ValidateTargets = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

export function validate(targets: ValidateTargets) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const [key, schema] of Object.entries(targets)) {
      const result = schema.safeParse((req as any)[key]);
      if (!result.success) {
        return res.status(400).json({
          error: `Invalid ${key}`,
          details: result.error.flatten(),
        });
      }
      (req as any)[key] = result.data;
    }
    next();
  };
}
