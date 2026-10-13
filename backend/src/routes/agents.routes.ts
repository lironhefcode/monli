import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { validate } from "../middleware/validate";
import { registerAgentSchema, type RegisterAgentInput } from "../schemas/agents.schema";
import { createEnrollmentToken, registerAgent } from "../services/agents.service";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";

export const agentsRouter = Router();

// Resolved from src/routes (tsx) or dist/routes (built) to backend/.
const STATIC_DIR = path.resolve(__dirname, "../../static");
// Filled by the agent build stage in backend/Dockerfile; empty in local dev.
const AGENT_DIST_DIR = path.resolve(__dirname, "../../agent-dist");

// Sends a file, turning "not there" into a 404 instead of a 500.
function sendFileOr404(res: Response, next: NextFunction, file: string, contentType: string, missing: string) {
  res.sendFile(file, { headers: { "Content-Type": contentType } }, (err?: NodeJS.ErrnoException) => {
    if (!err || res.headersSent) return;
    next(err.code === "ENOENT" ? new HttpError(404, missing) : err);
  });
}

// GET /agents/install.sh — public: the script the UI's install command pipes into sh.
agentsRouter.get("/install.sh", (_req: Request, res: Response, next: NextFunction) => {
  sendFileOr404(res, next, path.join(STATIC_DIR, "install.sh"), "text/x-shellscript", "install script not found");
});

// GET /agents/download/linux-x86_64 — public: the agent binary. The
// enrollment token, not the binary, is what's secret.
agentsRouter.get("/download/linux-x86_64", (_req: Request, res: Response, next: NextFunction) => {
  sendFileOr404(
    res,
    next,
    path.join(AGENT_DIST_DIR, "monli-agent-linux-x86_64"),
    "application/octet-stream",
    "agent binary not built (build the backend Docker image)"
  );
});

// Express reports IPv4 clients on a dual-stack socket as "::ffff:a.b.c.d".
function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

// POST /agents/enrollment-tokens — admin-facing: mint a single-use token and
// the curl command to show the user for installing an agent on a new host.
agentsRouter.post(
  "/enrollment-tokens",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createEnrollmentToken();
    res.status(201).json(result);
  })
);

// POST /agents/register — agent-facing: exchange the enrollment token for a
// target-bound API key. Identity is the agent-reported hostname plus the
// request's actual source IP (never a self-reported IP): same hostname + same
// IP re-binds the existing target, anything else creates a new one.
agentsRouter.post(
  "/register",
  validate({ body: registerAgentSchema }),
  asyncHandler(async (req: Request<Record<string, string>, unknown, RegisterAgentInput>, res: Response) => {
    const token = req.header("x-enrollment-token");
    if (!token) {
      throw new HttpError(401, "missing X-Enrollment-Token header");
    }
    if (!req.ip) {
      throw new HttpError(400, "could not determine source IP");
    }

    const result = await registerAgent(token, normalizeIp(req.ip), req.body);
    res.status(201).json(result);
  })
);