import { Router } from "express";
import { agentsRouter } from "./agents.routes";
import { alertsRouter } from "./alerts.routes";
import { metricsRouter } from "./metrics.routes";
import { targetsRouter } from "./targets.routes";
import { templatesRouter } from "./templates.routes";

export const router = Router();

router.use("/metrics", metricsRouter);
router.use("/templates", templatesRouter);
router.use("/targets", targetsRouter);
router.use("/agents", agentsRouter);
router.use("/alerts", alertsRouter);
