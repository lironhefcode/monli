import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.js";
import { requirePermission } from "../middleware/userAuth.js";
import {
  createDestinationSchema,
  createRuleSchema,
  emailServerSchema,
  idParamsSchema,
  updateDestinationSchema,
  updateRuleSchema,
  type CreateDestinationInput,
  type CreateRuleInput,
  type EmailServerInput,
  type UpdateDestinationInput,
  type UpdateRuleInput,
} from "../schemas/notifications.schema.js";
import {
  createDestination,
  deleteDestination,
  listDestinations,
  testDestination,
  updateDestination,
} from "../services/destinations.service.js";
import { deleteEmailServer, getEmailServer, saveEmailServer } from "../services/email-server.service.js";
import { createRule, deleteRule, listRules, listTeams, updateRule } from "../services/rules.service.js";
import { asyncHandler } from "../utils/async-handler.js";

// Admin-only, reads included: destinations and the email server hold secrets.
export const notificationsRouter = Router();

notificationsRouter.use(requirePermission("notifications"));

type IdRequest<Body> = Request<Record<string, string>, unknown, Body>;

// GET /notifications/destinations — saved webhooks and email recipient sets
notificationsRouter.get(
  "/destinations",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listDestinations());
  })
);

// POST /notifications/destinations — save a destination for rules to pick
notificationsRouter.post(
  "/destinations",
  validate({ body: createDestinationSchema }),
  asyncHandler(async (req: IdRequest<CreateDestinationInput>, res: Response) => {
    res.status(201).json(await createDestination(req.body));
  })
);

// PATCH /notifications/destinations/:id — rename, replace the URL or change recipients
notificationsRouter.patch(
  "/destinations/:id",
  validate({ params: idParamsSchema, body: updateDestinationSchema }),
  asyncHandler(async (req: IdRequest<UpdateDestinationInput>, res: Response) => {
    res.json(await updateDestination(Number(req.params.id), req.body));
  })
);

// DELETE /notifications/destinations/:id — refused (409) while a rule uses it
notificationsRouter.delete(
  "/destinations/:id",
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await deleteDestination(Number(req.params.id));
    res.status(204).end();
  })
);

// POST /notifications/destinations/:id/test — send a sample alert; reports how it went
notificationsRouter.post(
  "/destinations/:id/test",
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await testDestination(Number(req.params.id)));
  })
);

// GET /notifications/rules — which alerts go to which destinations
notificationsRouter.get(
  "/rules",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listRules());
  })
);

// POST /notifications/rules
notificationsRouter.post(
  "/rules",
  validate({ body: createRuleSchema }),
  asyncHandler(async (req: IdRequest<CreateRuleInput>, res: Response) => {
    res.status(201).json(await createRule(req.body));
  })
);

// PATCH /notifications/rules/:id — change some of its fields
notificationsRouter.patch(
  "/rules/:id",
  validate({ params: idParamsSchema, body: updateRuleSchema }),
  asyncHandler(async (req: IdRequest<UpdateRuleInput>, res: Response) => {
    res.json(await updateRule(Number(req.params.id), req.body));
  })
);

// DELETE /notifications/rules/:id
notificationsRouter.delete(
  "/rules/:id",
  validate({ params: idParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await deleteRule(Number(req.params.id));
    res.status(204).end();
  })
);

// GET /notifications/teams — team names in use, for the rule form
notificationsRouter.get(
  "/teams",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listTeams());
  })
);

// GET /notifications/email-server — the SMTP server; says whether a password is saved, never which
notificationsRouter.get(
  "/email-server",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getEmailServer());
  })
);

// PUT /notifications/email-server — set it; an omitted password keeps the saved one
notificationsRouter.put(
  "/email-server",
  validate({ body: emailServerSchema }),
  asyncHandler(async (req: IdRequest<EmailServerInput>, res: Response) => {
    res.json(await saveEmailServer(req.body));
  })
);

// DELETE /notifications/email-server — turn email off
notificationsRouter.delete(
  "/email-server",
  asyncHandler(async (_req: Request, res: Response) => {
    await deleteEmailServer();
    res.status(204).end();
  })
);
