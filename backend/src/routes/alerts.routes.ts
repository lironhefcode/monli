import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate";
import {
  alertIdParamsSchema,
  listAlertsQuerySchema,
  resolveAlertSchema,
  updateAlertSchema,
  type ListAlertsQuery,
  type ResolveAlertInput,
  type UpdateAlertInput,
} from "../schemas/alerts.schema";
import { listAlertComments, listAlerts, resolveAlert, updateAlert } from "../services/alerts.service";
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

// PATCH /alerts/:id — ack or unack, recorded as a comment
alertsRouter.patch(
  "/:id",
  validate({ params: alertIdParamsSchema, body: updateAlertSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateAlertInput>, res: Response) => {
    const alertId = Number(req.params.id);
    const alert = await updateAlert(alertId, req.body);
    res.json(alert);
  })
);

// GET /alerts/:id/comments — ack, unack and resolve history, oldest first
alertsRouter.get(
  "/:id/comments",
  validate({ params: alertIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const comments = await listAlertComments(Number(req.params.id));
    res.json(comments);
  })
);

// POST /alerts/:id/resolve — manually resolve an alert, with an optional note
alertsRouter.post(
  "/:id/resolve",
  validate({ params: alertIdParamsSchema, body: resolveAlertSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, ResolveAlertInput>, res: Response) => {
    const alertId = Number(req.params.id);
    const alert = await resolveAlert(alertId, req.body);
    res.json(alert);
  })
);