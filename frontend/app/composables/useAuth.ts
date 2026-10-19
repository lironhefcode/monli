import type { SessionUser, UserRole } from "~/types/users";

// The signed-in user, shared by every page. undefined = not checked yet,
// null = signed out.
export function useAuth() {
  const user = useState<SessionUser | null | undefined>("auth-user", () => undefined);

  const canEdit = computed(() => user.value?.role === "editor" || user.value?.role === "admin");
  const isAdmin = computed(() => user.value?.role === "admin");

  async function loadSession() {
    const { data } = await authClient.getSession();
    user.value = data
      ? {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: (data.user.role ?? "viewer") as UserRole,
        }
      : null;
    return user.value;
  }

  async function signOut() {
    await authClient.signOut();
    user.value = null;
    await navigateTo("/login");
  }

  return { user, canEdit, isAdmin, loadSession, signOut };
}
