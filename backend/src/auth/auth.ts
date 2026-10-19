import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin as adminPlugin } from "better-auth/plugins";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { ac, roles } from "./permissions.js";

// Browser origin of the UI: same as the API's in Docker (nginx serves both).
const publicOrigin = new URL(env.PUBLIC_API_URL).origin;

export const auth = betterAuth({
  // nginx strips /api, so Express sees /user/*; the browser calls /api/user/*.
  baseURL: publicOrigin,
  basePath: "/user",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [publicOrigin, ...env.AUTH_TRUSTED_ORIGINS],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Only admins create users (admin plugin's createUser), never self sign-up.
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [adminPlugin({ ac, roles, defaultRole: "viewer", adminRoles: ["admin"] })],
  hooks: {
    // An admin can't change their own role, so there's always one admin left.
    // (Removing yourself is already refused by the admin plugin.)
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/admin/set-role") return;
      const session = await getSessionFromCtx(ctx);
      if (session && ctx.body?.userId === session.user.id) {
        throw new APIError("BAD_REQUEST", { message: "you can't change your own role" });
      }
    }),
  },
});
