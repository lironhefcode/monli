import { Router, type Request, type Response } from "express";
import { env } from "../config/env.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { validate } from "../middleware/validate.js";
import { requirePermission, requireUser } from "../middleware/userAuth.js";
import {
  assignTemplateSchema,
  createTargetSchema,
  historyQuerySchema,
  overrideSchema,
  submitReadingSchema,
  targetIdParamsSchema,
  targetInterfaceParamsSchema,
  targetMetricParamsSchema,
  targetTemplateParamsSchema,
  updateInterfaceSchema,
  updateTargetSchema,
  type AssignTemplateInput,
  type CreateTargetInput,
  type HistoryQuery,
  type OverrideInput,
  type SubmitReadingInput,
  type UpdateInterfaceInput,
  type UpdateTargetInput,
} from "../schemas/targets.schema.js";
import {
  assignTemplate,
  createTarget,
  getEffectiveMetrics,
  getTargetDetail,
  getTargetHistory,
  listTargets,
  removeOverride,
  setInterfaceMonitored,
  setOverride,
  submitReading,
  unassignTemplate,
  updateTarget,
} from "../services/targets.service.js";
import { asyncHandler } from "../utils/async-handler.js";

export const targetsRouter = Router();

// GET /targets — admin-facing: list targets for the UI
targetsRouter.get(
  "/",
  requireUser,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listTargets());
  })
);

// GET /targets/:id — admin-facing: metadata, templates, resolved metric policies
targetsRouter.get(
  "/:id",
  requireUser,
  validate({ params: targetIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getTargetDetail(Number(req.params.id)));
  })
);

// PATCH /targets/:id — admin-facing: set or clear alias and responsible team
targetsRouter.patch(
  "/:id",
  requirePermission("edit"),
  validate({ params: targetIdParamsSchema, body: updateTargetSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateTargetInput>, res: Response) => {
    res.json(await updateTarget(Number(req.params.id), req.body));
  })
);

// POST /targets — manually create a target (network devices, services, etc.
// that don't run an agent). Agent-monitored hosts are created via
// POST /agents/register instead. The API key is only ever returned here
// (only its hash is stored).
targetsRouter.post(
  "/",
  requirePermission("edit"),
  validate({ body: createTargetSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, CreateTargetInput>, res: Response) => {
    const { target, apiKey } = await createTarget(req.body);
    res.status(201).json({ target, apiKey, serverUrl: env.PUBLIC_API_URL });
  })
);

// POST /targets/:id/templates — assign a template to a target
targetsRouter.post(
  "/:id/templates",
  requirePermission("edit"),
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
  requirePermission("edit"),
  validate({ params: targetTemplateParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const templateId = Number(req.params.templateId);
    await unassignTemplate(targetId, templateId);
    res.status(204).send();
  })
);

// PUT /targets/:id/overrides/:metricId — customize a metric for this target
// (full policy; replaces the template's)
targetsRouter.put(
  "/:id/overrides/:metricId",
  requirePermission("edit"),
  validate({ params: targetMetricParamsSchema, body: overrideSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, OverrideInput>, res: Response) => {
    const override = await setOverride(Number(req.params.id), Number(req.params.metricId), req.body);
    res.json(override);
  })
);

// DELETE /targets/:id/overrides/:metricId — return the metric to its template
targetsRouter.delete(
  "/:id/overrides/:metricId",
  requirePermission("edit"),
  validate({ params: targetMetricParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await removeOverride(Number(req.params.id), Number(req.params.metricId));
    res.status(204).send();
  })
);

// PATCH /targets/:id/interfaces/:interfaceId — turn monitoring of one
// interface (disk, NIC, ...) on or off
targetsRouter.patch(
  "/:id/interfaces/:interfaceId",
  requirePermission("edit"),
  validate({ params: targetInterfaceParamsSchema, body: updateInterfaceSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateInterfaceInput>, res: Response) => {
    const targetInterface = await setInterfaceMonitored(
      Number(req.params.id),
      Number(req.params.interfaceId),
      req.body
    );
    res.json(targetInterface);
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

// POST /targets/:id/metrics — agent-facing: submit a reading. 202 with no
// body when the reading's interface isn't monitored (dropped).
targetsRouter.post(
  "/:id/metrics",
  validate({ params: targetIdParamsSchema, body: submitReadingSchema }),
  apiKeyAuth,
  asyncHandler(async (req: Request<Record<string, string>, unknown, SubmitReadingInput>, res: Response) => {
    const targetId = Number(req.params.id);
    const reading = await submitReading(targetId, req.body);
    if (!reading) {
      res.status(202).end();
      return;
    }
    res.status(201).json({ ...reading, id: reading.id.toString() });
  })
);

// GET /targets/:id/history?range=1h|6h|24h|7d — bucketed time series of every
// metric on the target, for charting
targetsRouter.get(
  "/:id/history",
  requireUser,
  validate({ params: targetIdParamsSchema, query: historyQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const { range } = req.query as unknown as HistoryQuery;
    const history = await getTargetHistory(targetId, range);
    res.json(history);
  })
);
