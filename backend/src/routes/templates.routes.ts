import { Router } from "express";
import { validate } from "../middleware/validate";
import {
  addTemplateMetricSchema,
  createTemplateSchema,
  templateIdParamsSchema,
} from "../schemas/templates.schema";

export const templatesRouter = Router();

// POST /templates — create a metric template
templatesRouter.post(
  "/",
  validate({ body: createTemplateSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);

// POST /templates/:id/metrics — add a metric + default policy to a template
templatesRouter.post(
  "/:id/metrics",
  validate({ params: templateIdParamsSchema, body: addTemplateMetricSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);
