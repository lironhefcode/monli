import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import type { RouteLocationNormalized } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import authMiddleware from "~/middleware/auth.global";
import type { SessionUser } from "~/types/users";

const { getSession, signOut, navigateToMock } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  navigateToMock: vi.fn((to: unknown) => to),
}));

mockNuxtImport("authClient", () => ({ getSession, signOut }));
mockNuxtImport("navigateTo", () => navigateToMock);

function sessionFor(role: string | null) {
  return { data: { user: { id: "u1", name: "Alice", email: "alice@monli.test", role } } };
}

function route(path: string, fullPath = path) {
  return { path, fullPath } as RouteLocationNormalized;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth().user.value = undefined;
});

describe("useAuth", () => {
  it("loads the signed-in user from the session", async () => {
    getSession.mockResolvedValue(sessionFor("editor"));
    const { user, loadSession } = useAuth();

    await loadSession();

    expect(user.value).toEqual({ id: "u1", name: "Alice", email: "alice@monli.test", role: "editor" });
  });

  it("treats a user without a role as a viewer", async () => {
    getSession.mockResolvedValue(sessionFor(null));
    expect((await useAuth().loadSession())?.role).toBe("viewer");
  });

  it("sets the user to null when signed out", async () => {
    getSession.mockResolvedValue({ data: null });
    const { user, loadSession } = useAuth();

    await loadSession();
    expect(user.value).toBeNull();
  });

  it.each<[SessionUser["role"], boolean, boolean]>([
    ["viewer", false, false],
    ["editor", true, false],
    ["admin", true, true],
  ])("%s: canEdit %s, isAdmin %s", (role, canEdit, isAdmin) => {
    const auth = useAuth();
    auth.user.value = { id: "u1", name: "Alice", email: "a@monli.test", role };

    expect(auth.canEdit.value).toBe(canEdit);
    expect(auth.isAdmin.value).toBe(isAdmin);
  });

  it("shares the user between callers", () => {
    useAuth().user.value = { id: "u1", name: "Alice", email: "a@monli.test", role: "admin" };
    expect(useAuth().isAdmin.value).toBe(true);
  });

  it("signs out, forgets the user and goes to /login", async () => {
    const auth = useAuth();
    auth.user.value = { id: "u1", name: "Alice", email: "a@monli.test", role: "admin" };

    await auth.signOut();

    expect(signOut).toHaveBeenCalled();
    expect(auth.user.value).toBeNull();
    expect(navigateToMock).toHaveBeenCalledWith("/login");
  });
});

describe("auth middleware", () => {
  const from = route("/");

  it("sends a signed-out user to /login, remembering where they were going", async () => {
    getSession.mockResolvedValue({ data: null });

    await authMiddleware(route("/alerts", "/alerts?status=open"), from);

    expect(navigateToMock).toHaveBeenCalledWith({ path: "/login", query: { redirect: "/alerts?status=open" } });
  });

  it("lets a signed-out user open /login", async () => {
    getSession.mockResolvedValue({ data: null });

    expect(await authMiddleware(route("/login"), from)).toBeUndefined();
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it("sends a signed-in user away from /login", async () => {
    getSession.mockResolvedValue(sessionFor("viewer"));

    await authMiddleware(route("/login"), from);
    expect(navigateToMock).toHaveBeenCalledWith("/");
  });

  it("lets a signed-in user through", async () => {
    getSession.mockResolvedValue(sessionFor("viewer"));

    expect(await authMiddleware(route("/resources"), from)).toBeUndefined();
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it("checks the session only once per page load", async () => {
    getSession.mockResolvedValue(sessionFor("viewer"));

    await authMiddleware(route("/resources"), from);
    await authMiddleware(route("/alerts"), from);
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});
