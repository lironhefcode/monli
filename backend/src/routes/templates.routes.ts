import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.js";
import { requirePermission, requireUser } from "../middleware/userAuth.js";
import {
  addTemplateMetricSchema,
  createTemplateSchema,
  templateIdParamsSchema,
  templateMetricParamsSchema,
  updateTemplateMetricSchema,
  type AddTemplateMetricInput,
  type CreateTemplateInput,
  type UpdateTemplateMetricInput,
} from "../schemas/templates.schema.js";
import {
  addTemplateMetric,
  createTemplate,
  getTemplateDetail,
  listTemplates,
  removeTemplateMetric,
  updateTemplateMetric,
} from "../services/templates.service.js";
import { asyncHandler } from "../utils/async-handler.js";

export const templatesRouter = Router();

// GET /templates — list templates (e.g. for assigning to a target)
templatesRouter.get(
  "/",
  requireUser,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listTemplates());
  })
);

// POST /templates — create a metric template
templatesRouter.post(
  "/",
  requirePermission("edit"),
  validate({ body: createTemplateSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, CreateTemplateInput>, res: Response) => {
    const template = await createTemplate(req.body);
    res.status(201).json(template);
  })
);

// POST /templates/:id/metrics — add a metric + default policy to a template
templatesRouter.post(
  "/:id/metrics",
  requirePermission("edit"),
  validate({ params: templateIdParamsSchema, body: addTemplateMetricSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, AddTemplateMetricInput>, res: Response) => {
    const templateId = Number(req.params.id);
    const templateMetric = await addTemplateMetric(templateId, req.body);
    res.status(201).json(templateMetric);
  })
);

// GET /templates/:id — template detail with its metric policies
templatesRouter.get(
  "/:id",
  requireUser,
  validate({ params: templateIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getTemplateDetail(Number(req.params.id)));
  })
);

// PATCH /templates/:id/metrics/:metricId — change a metric's default policy
templatesRouter.patch(
  "/:id/metrics/:metricId",
  requirePermission("edit"),
  validate({ params: templateMetricParamsSchema, body: updateTemplateMetricSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateTemplateMetricInput>, res: Response) => {
    const templateMetric = await updateTemplateMetric(Number(req.params.id), Number(req.params.metricId), req.body);
    res.json(templateMetric);
  })
);

// DELETE /templates/:id/metrics/:metricId — remove a metric from a template
templatesRouter.delete(
  "/:id/metrics/:metricId",
  requirePermission("edit"),
  validate({ params: templateMetricParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await removeTemplateMetric(Number(req.params.id), Number(req.params.metricId));
    res.status(204).send();
  })
);
