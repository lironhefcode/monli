export type UserRole = "viewer" | "editor" | "admin";

export const userRoles: { value: UserRole; label: string; description: string }[] = [
  { value: "viewer", label: "Viewer", description: "Sees every page; no actions" },
  { value: "editor", label: "Editor", description: "Everything except managing users" },
  { value: "admin", label: "Admin", description: "Everything, including users" },
];

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export type UserRow = SessionUser;

export interface NewUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}
