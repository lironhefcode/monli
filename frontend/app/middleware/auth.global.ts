// Every page needs a signed-in user except /login. The session is checked
// once per page load; after that, a 401 from the API sends the user back to
// /login (plugins/api-auth.client.ts).
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, loadSession } = useAuth();
  if (user.value === undefined) {
    await loadSession();
  }

  if (to.path === "/login") {
    return user.value ? navigateTo("/") : undefined;
  }
  if (!user.value) {
    return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
  }
});
