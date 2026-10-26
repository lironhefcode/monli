import { auth } from "../../src/auth/auth.js";
import type { Role } from "../../src/auth/permissions.js";

const password = "test-password";

// Creates a user with the role and signs them in. Returns the Cookie header
// value to send with supertest, and the user.
export async function signedInAs(role: Role, name = `${role} user`) {
  const email = `${role}-${crypto.randomUUID()}@monli.test`;
  const { user } = await auth.api.createUser({ body: { name, email, password, role } });
  const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  const cookie = headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
  return { cookie, user };
}
