import cors from "cors";
import express from "express";
import morgan from "morgan";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/auth.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { router } from "./routes/index.js";

export function createApp() {
  const app = express();

  // Agent identity relies on req.ip; only trust X-Forwarded-For from the
  // proxies listed here, never blindly.
  if (env.TRUST_PROXY) {
    app.set("trust proxy", env.TRUST_PROXY);
  }

  app.use(cors());
  app.use(morgan("dev"));

  // Sign-in, sessions and user management (/api/user/* through nginx).
  // Must come before express.json(): Better Auth reads the raw body itself.
  app.all("/user/*", toNodeHandler(auth));

  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use(router);

  app.use(errorHandler);

  return app;
}
