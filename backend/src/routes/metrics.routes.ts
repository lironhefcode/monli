import { Router } from "express";
import { validate } from "../middleware/validate";
import { createMetricSchema } from "../schemas/metrics.schema";

export const metricsRouter = Router();

// POST /metrics — create a metric in the catalog
metricsRouter.post("/", validate({ body: createMetricSchema }), (req, res) => {
  // TODO: implement
  res.status(501).json({ error: "Not implemented" });
});

// GET /metrics — list catalog metrics
metricsRouter.get("/", (req, res) => {
  // TODO: implement
  res.status(501).json({ error: "Not implemented" });
});
