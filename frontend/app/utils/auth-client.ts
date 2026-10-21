import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";

import { ac, roles } from "../../../backend/src/auth/permissions";

// Better Auth's endpoints live under /api/user (nginx strips /api; the dev
// server proxies it). The session is an httpOnly cookie on this origin.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/user",
  // The backend's roles, so role arguments are typed as viewer/editor/admin.
  plugins: [adminClient({ ac, roles })],
});
