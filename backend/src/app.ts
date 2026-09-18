import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { router } from "./routes";

export function createApp() {
  const app = express();

  // Agent identity relies on req.ip; only trust X-Forwarded-For from the
  // proxies listed here, never blindly.
  if (env.TRUST_PROXY) {
    app.set("trust proxy", env.TRUST_PROXY);
  }

  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use(router);

  app.use(errorHandler);

  return app;
}
