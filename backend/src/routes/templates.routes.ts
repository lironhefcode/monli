import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate";
import {
  addTemplateMetricSchema,
  createTemplateSchema,
  templateIdParamsSchema,
  type AddTemplateMetricInput,
  type CreateTemplateInput,
} from "../schemas/templates.schema";
import { addTemplateMetric, createTemplate } from "../services/templates.service";
import { asyncHandler } from "../utils/async-handler";

export const templatesRouter = Router();

// POST /templates — create a metric template
templatesRouter.post(
  "/",
  validate({ body: createTemplateSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, CreateTemplateInput>, res: Response) => {
    const template = await createTemplate(req.body);
    res.status(201).json(template);
  })
);

// POST /templates/:id/metrics — add a metric + default policy to a template
templatesRouter.post(
  "/:id/metrics",
  validate({ params: templateIdParamsSchema, body: addTemplateMetricSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, AddTemplateMetricInput>, res: Response) => {
    const templateId = Number(req.params.id);
    const templateMetric = await addTemplateMetric(templateId, req.body);
    res.status(201).json(templateMetric);
  })
);