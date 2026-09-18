import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

type ValidateTargets = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

export function validate(targets: ValidateTargets) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (targets.body) {
      const result = targets.body.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Invalid body", details: result.error.flatten() });
        return;
      }
      req.body = result.data;
    }

    if (targets.params) {
      const result = targets.params.safeParse(req.params);
      if (!result.success) {
        res.status(400).json({ error: "Invalid params", details: result.error.flatten() });
        return;
      }
      Object.assign(req.params, result.data);
    }

    if (targets.query) {
      const result = targets.query.safeParse(req.query);
      if (!result.success) {
        res.status(400).json({ error: "Invalid query", details: result.error.flatten() });
        return;
      }
      Object.assign(req.query, result.data);
    }

    next();
  };
}