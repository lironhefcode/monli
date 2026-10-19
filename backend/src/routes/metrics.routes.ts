import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.js";
import { requirePermission, requireUser } from "../middleware/userAuth.js";
import {
  createMetricSchema,
  metricIdParamsSchema,
  updateMetricDefaultsSchema,
  type CreateMetricInput,
  type UpdateMetricDefaultsInput,
} from "../schemas/metrics.schema.js";
import { createMetric, listMetrics, updateMetricDefaults } from "../services/metrics.service.js";
import { asyncHandler } from "../utils/async-handler.js";

export const metricsRouter = Router();

// POST /metrics — create a metric in the catalog
metricsRouter.post(
  "/",
  requirePermission("edit"),
  validate({ body: createMetricSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, CreateMetricInput>, res: Response) => {
    const metric = await createMetric(req.body);
    res.status(201).json(metric);
  })
);

// PATCH /metrics/:id — edit a metric's suggested policy (forward-only)
metricsRouter.patch(
  "/:id",
  requirePermission("edit"),
  validate({ params: metricIdParamsSchema, body: updateMetricDefaultsSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateMetricDefaultsInput>, res: Response) => {
    res.json(await updateMetricDefaults(Number(req.params.id), req.body));
  })
);

// GET /metrics — list catalog metrics
metricsRouter.get(
  "/",
  requireUser,
  asyncHandler(async (_req: Request, res: Response) => {
    const metrics = await listMetrics();
    res.json(metrics);
  })
);