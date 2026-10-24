import { Router } from "express";
import { agentsRouter } from "./agents.routes.js";
import { alertsRouter } from "./alerts.routes.js";
import { metricsRouter } from "./metrics.routes.js";
import { targetsRouter } from "./targets.routes.js";
import { templatesRouter } from "./templates.routes.js";
import { webhooksRouter } from "./webhooks.routes.js";

export const router = Router();

router.use("/metrics", metricsRouter);
router.use("/templates", templatesRouter);
router.use("/targets", targetsRouter);
router.use("/agents", agentsRouter);
router.use("/alerts", alertsRouter);
router.use("/webhooks", webhooksRouter);
