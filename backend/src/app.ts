import cors from "cors";
import express from "express";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler";
import { router } from "./routes";

export function createApp() {
  const app = express();

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
