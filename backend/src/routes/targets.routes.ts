import { Router, type Request, type Response } from "express";
import { env } from "../config/env";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { validate } from "../middleware/validate";
import {
  assignTemplateSchema,
  createTargetSchema,
  historyQuerySchema,
  overrideSchema,
  submitReadingSchema,
  targetIdParamsSchema,
  targetMetricParamsSchema,
  targetTemplateParamsSchema,
  type AssignTemplateInput,
  type CreateTargetInput,
  type OverrideInput,
  type SubmitReadingInput,
} from "../schemas/targets.schema";
import {
  assignTemplate,
  createTarget,
  getEffectiveMetrics,
  getMetricHistory,
  setOverride,
  submitReading,
  unassignTemplate,
} from "../services/targets.service";
import { asyncHandler } from "../utils/async-handler";

export const targetsRouter = Router();

// POST /targets — manually create a target (network devices, services, etc.
// that don't run an agent). Agent-monitored hosts are created via
// POST /agents/register instead. The API key is only ever returned here
// (only its hash is stored).
targetsRouter.post(
  "/",
  validate({ body: createTargetSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, CreateTargetInput>, res: Response) => {
    const { target, apiKey } = await createTarget(req.body);
    res.status(201).json({ target, apiKey, serverUrl: env.PUBLIC_API_URL });
  })
);

// POST /targets/:id/templates — assign a template to a target
targetsRouter.post(
  "/:id/templates",
  validate({ params: targetIdParamsSchema, body: assignTemplateSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, AssignTemplateInput>, res: Response) => {
    const targetId = Number(req.params.id);
    const targetTemplate = await assignTemplate(targetId, req.body);
    res.status(201).json(targetTemplate);
  })
);

// DELETE /targets/:id/templates/:templateId — unassign a template
targetsRouter.delete(
  "/:id/templates/:templateId",
  validate({ params: targetTemplateParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const templateId = Number(req.params.templateId);
    await unassignTemplate(targetId, templateId);
    res.status(204).send();
  })
);

// POST /targets/:id/overrides — set/update a per-metric override
targetsRouter.post(
  "/:id/overrides",
  validate({ params: targetIdParamsSchema, body: overrideSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, OverrideInput>, res: Response) => {
    const targetId = Number(req.params.id);
    const override = await setOverride(targetId, req.body);
    res.status(201).json(override);
  })
);

// GET /targets/:id/metrics — agent-facing: effective flat metric list
targetsRouter.get(
  "/:id/metrics",
  apiKeyAuth,
  validate({ params: targetIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const metrics = await getEffectiveMetrics(targetId);
    res.json(metrics);
  })
);

// POST /targets/:id/metrics — agent-facing: submit a reading
targetsRouter.post(
  "/:id/metrics",
  apiKeyAuth,
  validate({ params: targetIdParamsSchema, body: submitReadingSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, SubmitReadingInput>, res: Response) => {
    const targetId = Number(req.params.id);
    const reading = await submitReading(targetId, req.body);
    res.status(201).json({ ...reading, id: reading.id.toString() });
  })
);

// GET /targets/:id/metrics/:metricId/history — time-series data for charting
targetsRouter.get(
  "/:id/metrics/:metricId/history",
  validate({ params: targetMetricParamsSchema, query: historyQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const metricId = Number(req.params.metricId);
    const limit = Number(req.query.limit);
    const history = await getMetricHistory(targetId, metricId, limit);
    res.json(history);
  })
);