import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.js";
import { requirePermission } from "../middleware/userAuth.js";
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookIdParamsSchema,
  type CreateWebhookInput,
  type UpdateWebhookInput,
} from "../schemas/webhooks.schema.js";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  testWebhook,
  updateWebhook,
} from "../services/webhooks.service.js";
import { asyncHandler } from "../utils/async-handler.js";

// Admin-only, reads included: the URLs embed secret tokens.
export const webhooksRouter = Router();

webhooksRouter.use(requirePermission("webhooks"));

// GET /webhooks — every webhook, with its latest delivery outcome
webhooksRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await listWebhooks());
  })
);

// POST /webhooks — add a webhook
webhooksRouter.post(
  "/",
  validate({ body: createWebhookSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, CreateWebhookInput>, res: Response) => {
    res.status(201).json(await createWebhook(req.body));
  })
);

// PATCH /webhooks/:id — change some of its fields
webhooksRouter.patch(
  "/:id",
  validate({ params: webhookIdParamsSchema, body: updateWebhookSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, UpdateWebhookInput>, res: Response) => {
    res.json(await updateWebhook(Number(req.params.id), req.body));
  })
);

// DELETE /webhooks/:id
webhooksRouter.delete(
  "/:id",
  validate({ params: webhookIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await deleteWebhook(Number(req.params.id));
    res.status(204).end();
  })
);

// POST /webhooks/:id/test — send a sample alert; reports how the endpoint answered
webhooksRouter.post(
  "/:id/test",
  validate({ params: webhookIdParamsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await testWebhook(Number(req.params.id)));
  })
);
