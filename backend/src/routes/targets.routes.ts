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
  targetTemplateParamsSchema,
  type AssignTemplateInput,
  type CreateTargetInput,
  type HistoryQuery,
  type OverrideInput,
  type SubmitReadingInput,
} from "../schemas/targets.schema";
import {
  assignTemplate,
  createTarget,
  getEffectiveMetrics,
  getTargetDetail,
  getTargetHistory,
  listTargets,
  setOverride,
  submitReading,
  unassignTemplate,
} from "../services/targets.service";
import { asyncHandler } from "../utils/async-handler";

export const targetsRouter = Router();

// GET /targets — admin-facing: list targets for the UI
targetsRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listTargets());
  })
);

// GET /targets/:id — admin-facing: metadata, templates, resolved metric policies
targetsRouter.get(
  "/:id",
  validate({ params: targetIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getTargetDetail(Number(req.params.id)));
  })
);

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
  validate({ params: targetIdParamsSchema }),
  apiKeyAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const metrics = await getEffectiveMetrics(targetId);
    res.json(metrics);
  })
);

// POST /targets/:id/metrics — agent-facing: submit a reading
targetsRouter.post(
  "/:id/metrics",
  validate({ params: targetIdParamsSchema, body: submitReadingSchema }),
  apiKeyAuth,
  asyncHandler(async (req: Request<Record<string, string>, unknown, SubmitReadingInput>, res: Response) => {
    const targetId = Number(req.params.id);
    const reading = await submitReading(targetId, req.body);
    res.status(201).json({ ...reading, id: reading.id.toString() });
  })
);

// GET /targets/:id/history?range=1h|6h|24h|7d — bucketed time series of every
// metric on the target, for charting
targetsRouter.get(
  "/:id/history",
  validate({ params: targetIdParamsSchema, query: historyQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const { range } = req.query as unknown as HistoryQuery;
    const history = await getTargetHistory(targetId, range);
    res.json(history);
  })
);
