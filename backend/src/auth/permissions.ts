import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

// "monli: edit" covers every action in the app (ack, resolve, editing
// templates, resources and metrics, minting enrollment tokens). "monli:
// notifications" manages notification rules, destinations and the email
// server, admin-only since they hold secrets.
// The user and session statements are Better Auth's own, used by its admin
// endpoints.
const statement = {
  ...defaultStatements,
  monli: ["edit", "notifications"],
} as const;

export const ac = createAccessControl(statement);

export const viewer = ac.newRole({
  monli: [],
});

export const editor = ac.newRole({
  monli: ["edit"],
});

export const admin = ac.newRole({
  monli: ["edit", "notifications"],
  user: ["create", "list", "set-role", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

export const roles = { viewer, editor, admin };
export type Role = keyof typeof roles;
// An app action a route can require, e.g. "edit".
export type MonliPermission = (typeof statement.monli)[number];
