import { Router } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { validate } from "../middleware/validate";
import {
  assignTemplateSchema,
  createTargetSchema,
  overrideSchema,
  submitReadingSchema,
  targetIdParamsSchema,
  targetTemplateParamsSchema,
} from "../schemas/targets.schema";

export const targetsRouter = Router();

// POST /targets — create a target, generates API key
targetsRouter.post("/", validate({ body: createTargetSchema }), (req, res) => {
  // TODO: implement
  res.status(501).json({ error: "Not implemented" });
});

// POST /targets/:id/templates — assign a template to a target
targetsRouter.post(
  "/:id/templates",
  validate({ params: targetIdParamsSchema, body: assignTemplateSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);

// DELETE /targets/:id/templates/:templateId — unassign a template
targetsRouter.delete(
  "/:id/templates/:templateId",
  validate({ params: targetTemplateParamsSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);

// POST /targets/:id/overrides — set/update a per-metric override
targetsRouter.post(
  "/:id/overrides",
  validate({ params: targetIdParamsSchema, body: overrideSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);

// GET /targets/:id/metrics — agent-facing: effective flat metric list
targetsRouter.get(
  "/:id/metrics",
  apiKeyAuth,
  validate({ params: targetIdParamsSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);

// POST /targets/:id/metrics — agent-facing: submit a reading
targetsRouter.post(
  "/:id/metrics",
  apiKeyAuth,
  validate({ params: targetIdParamsSchema, body: submitReadingSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);

// GET /targets/:id/metrics/:metricId/history — time-series data for charting
targetsRouter.get("/:id/metrics/:metricId/history", (req, res) => {
  // TODO: implement
  res.status(501).json({ error: "Not implemented" });
});
