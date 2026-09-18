import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate";
import { createMetricSchema, type CreateMetricInput } from "../schemas/metrics.schema";
import { createMetric, listMetrics } from "../services/metrics.service";
import { asyncHandler } from "../utils/async-handler";

export const metricsRouter = Router();

// POST /metrics — create a metric in the catalog
metricsRouter.post(
  "/",
  validate({ body: createMetricSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, CreateMetricInput>, res: Response) => {
    const metric = await createMetric(req.body);
    res.status(201).json(metric);
  })
);

// GET /metrics — list catalog metrics
metricsRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const metrics = await listMetrics();
    res.json(metrics);
  })
);