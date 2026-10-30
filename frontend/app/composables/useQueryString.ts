import type { LocationQueryValueRaw } from "vue-router";

type QueryPatch = Record<string, LocationQueryValueRaw | LocationQueryValueRaw[]>;

// Query changes made in the same tick, applied in one replace so they don't
// overwrite each other (each replace would otherwise start from the old query).
let pendingQuery: QueryPatch | null = null;

// A value kept in the URL query under `key`, so reloads and shared links keep
// it. A local ref keeps typing responsive and the URL follows it; an empty
// value drops the key. Back/forward and links to the page update the ref too.
function useQueryValue<T>(key: string, read: (raw: unknown) => T, write: (value: T) => QueryPatch[string]) {
  const router = useRouter();
  const route = router.currentRoute;
  const current = () => read(route.value.query[key]);
  // By content, since lists come back as new arrays on every navigation.
  const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const value = ref(current()) as Ref<T>;

  watch(value, (next) => {
    if (same(next, current()) && !pendingQuery) return;
    if (!pendingQuery) {
      pendingQuery = {};
      queueMicrotask(() => {
        const patch = pendingQuery;
        pendingQuery = null;
        router.replace({ query: { ...route.value.query, ...patch } });
      });
    }
    pendingQuery[key] = write(next);
  });
  watch(
    () => route.value.query[key],
    () => {
      const next = current();
      if (!same(next, value.value)) value.value = next;
    },
  );

  return value;
}

// One string; "" drops the key.
export function useQueryString(key: string) {
  return useQueryValue(
    key,
    (raw) => (typeof raw === "string" ? raw : ""),
    (value) => value || undefined,
  );
}

// Several strings, as a repeated key (?team=a&team=b); [] drops the key.
export function useQueryList(key: string) {
  return useQueryValue(
    key,
    (raw) => (Array.isArray(raw) ? raw : [raw]).filter((item): item is string => typeof item === "string" && item !== ""),
    (value) => (value.length ? value : undefined),
  );
}
