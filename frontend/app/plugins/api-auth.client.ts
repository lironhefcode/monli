// A 401 from the API means the session expired or was revoked (e.g. while a
// page is polling): forget the user and go to /login. useFetch uses this
// $fetch too.
export default defineNuxtPlugin(() => {
  globalThis.$fetch = $fetch.create({
    onResponseError({ response }) {
      if (response.status !== 401) return;
      const { user } = useAuth();
      user.value = null;
      const route = useRoute();
      if (route.path !== "/login") {
        void navigateTo({ path: "/login", query: { redirect: route.fullPath } });
      }
    },
  });
});
