import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.js";
import { requirePermission, requireUser } from "../middleware/userAuth.js";
import {
  alertIdParamsSchema,
  listAlertsQuerySchema,
  resolveAlertSchema,
  updateAlertSchema,
  type ListAlertsQuery,
  type ResolveAlertInput,
  type UpdateAlertInput,
} from "../schemas/alerts.schema.js";
import { listAlertComments, listAlerts, resolveAlert, updateAlert } from "../services/alerts.service.js";
import { listTeams } from "../services/rules.service.js";
import { asyncHandler } from "../utils/async-handler.js";

export const alertsRouter = Router();

// GET /alerts — one page of alerts, newest first, with the total and per-tab counts
alertsRouter.get(
  "/",
  requireUser,
  validate({ query: listAlertsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const page = await listAlerts(req.query as unknown as ListAlertsQuery);
    res.json(page);
  })
);

// GET /alerts/teams — team names in use, for the team filter
alertsRouter.get(
  "/teams",
  requireUser,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listTeams());
  })
);

// PATCH /alerts/:id — ack or unack, recorded as a comment
alertsRouter.patch(
  "/:id",
  requirePermission("edit"),
  validate({ params: alertIdParamsSchema, body: updateAlertSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateAlertInput>, res: Response) => {
    const alertId = Number(req.params.id);
    const alert = await updateAlert(alertId, req.body, req.user!.name);
    res.json(alert);
  })
);

// GET /alerts/:id/comments — ack, unack and resolve history, oldest first
alertsRouter.get(
  "/:id/comments",
  requireUser,
  validate({ params: alertIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const comments = await listAlertComments(Number(req.params.id));
    res.json(comments);
  })
);

// POST /alerts/:id/resolve — manually resolve an alert, with an optional note
alertsRouter.post(
  "/:id/resolve",
  requirePermission("edit"),
  validate({ params: alertIdParamsSchema, body: resolveAlertSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, ResolveAlertInput>, res: Response) => {
    const alertId = Number(req.params.id);
    const alert = await resolveAlert(alertId, req.body, req.user!.name);
    res.json(alert);
  })
);