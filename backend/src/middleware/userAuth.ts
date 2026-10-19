import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth.js";
import type { MonliPermission, Role } from "../auth/permissions.js";
import { HttpError } from "../utils/http-error.js";

export type SessionUser = typeof auth.$Infer.Session.user;

declare module "express-serve-static-core" {
  interface Request {
    // Set by requireUser / requirePermission.
    user?: SessionUser;
  }
}

// UI routes only; agent routes use apiKeyAuth or an enrollment token instead.
// Any signed-in role (viewer, editor, admin) may read.
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  void loadUser(req).then(() => next()).catch(next);
}

// The signed-in user's role must grant this permission. Which roles do is
// decided in auth/permissions.ts, not here.
export function requirePermission(permission: MonliPermission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    void loadUser(req)
      .then(async (user) => {
        // Checked against the session's role, so no extra user lookup.
        const { success } = await auth.api.userHasPermission({
          body: { role: (user.role ?? "viewer") as Role, permissions: { monli: [permission] } },
        });
        if (!success) {
          throw new HttpError(403, `requires the ${permission} permission`);
        }
        next();
      })
      .catch(next);
  };
}

async function loadUser(req: Request): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    throw new HttpError(401, "not signed in");
  }
  req.user = session.user;
  return session.user;
}
