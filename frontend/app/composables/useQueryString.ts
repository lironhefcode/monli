// Query changes made in the same tick, applied in one replace so they don't
// overwrite each other (each replace would otherwise start from the old query).
let pendingQuery: Record<string, string | undefined> | null = null;

// A string kept in the URL query under `key`, so reloads and shared links keep
// it. A local ref keeps typing responsive and the URL follows it; "" drops the
// key. Back/forward and links to the page update the ref too.
export function useQueryString(key: string) {
  const router = useRouter();
  const route = router.currentRoute;

  const read = () => {
    const value = route.value.query[key];
    return typeof value === "string" ? value : "";
  };
  const value = ref(read());

  watch(value, (next) => {
    if (next === read() && !pendingQuery) return;
    if (!pendingQuery) {
      pendingQuery = {};
      queueMicrotask(() => {
        const patch = pendingQuery;
        pendingQuery = null;
        router.replace({ query: { ...route.value.query, ...patch } });
      });
    }
    pendingQuery[key] = next || undefined;
  });
  watch(
    () => route.value.query[key],
    () => {
      value.value = read();
    }
  );

  return value;
}
