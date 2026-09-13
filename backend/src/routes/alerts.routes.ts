import { Router } from "express";
import { validate } from "../middleware/validate";
import {
  alertIdParamsSchema,
  firstResponseSchema,
  listAlertsQuerySchema,
} from "../schemas/alerts.schema";

export const alertsRouter = Router();

// GET /alerts — list alerts (filter by status/team/priority)
alertsRouter.get("/", validate({ query: listAlertsQuerySchema }), (req, res) => {
  // TODO: implement
  res.status(501).json({ error: "Not implemented" });
});

// POST /alerts/:id/first-response — record acknowledgment (who, when, note)
alertsRouter.post(
  "/:id/first-response",
  validate({ params: alertIdParamsSchema, body: firstResponseSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);

// POST /alerts/:id/resolve — manually resolve an alert
alertsRouter.post(
  "/:id/resolve",
  validate({ params: alertIdParamsSchema }),
  (req, res) => {
    // TODO: implement
    res.status(501).json({ error: "Not implemented" });
  }
);
