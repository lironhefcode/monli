import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate";
import {
  alertIdParamsSchema,
  firstResponseSchema,
  listAlertsQuerySchema,
  type FirstResponseInput,
  type ListAlertsQuery,
} from "../schemas/alerts.schema";
import { listAlerts, recordFirstResponse, resolveAlert } from "../services/alerts.service";
import { asyncHandler } from "../utils/async-handler";

export const alertsRouter = Router();

// GET /alerts — list alerts (filter by status/team/priority)
alertsRouter.get(
  "/",
  validate({ query: listAlertsQuerySchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, unknown, ListAlertsQuery>, res: Response) => {
    const alerts = await listAlerts(req.query);
    res.json(alerts);
  })
);

// POST /alerts/:id/first-response — record acknowledgment (who, when, note)
alertsRouter.post(
  "/:id/first-response",
  validate({ params: alertIdParamsSchema, body: firstResponseSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, FirstResponseInput>, res: Response) => {
    const alertId = Number(req.params.id);
    const alert = await recordFirstResponse(alertId, req.body);
    res.json(alert);
  })
);

// POST /alerts/:id/resolve — manually resolve an alert
alertsRouter.post(
  "/:id/resolve",
  validate({ params: alertIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const alertId = Number(req.params.id);
    const alert = await resolveAlert(alertId);
    res.json(alert);
  })
);