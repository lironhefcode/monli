import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, type Ref } from "vue";

let q: Ref<string>;
let status: Ref<string>;
let teams: Ref<string[]>;

const Filters = defineComponent({
  setup() {
    q = useQueryString("q");
    status = useQueryString("status");
    teams = useQueryList("team");
    return () => h("div");
  },
});

// Signed out with the session already loaded, so the auth middleware doesn't
// call the API on each navigation.
beforeEach(() => {
  useAuth().user.value = null;
});

// Mounted on /login, since the auth middleware sends a signed-out visitor
// anywhere else there.
function mountAt(query: Record<string, string>) {
  return mountSuspended(Filters, { route: { path: "/login", query } });
}

const currentQuery = () => useRouter().currentRoute.value.query;

describe("useQueryString", () => {
  it("reads its initial value from the URL", async () => {
    await mountAt({ q: "web", tab: "acknowledged" });
    expect(q.value).toBe("web");
    expect(status.value).toBe("");
  });

  it("writes changes to the URL and keeps other keys", async () => {
    await mountAt({ tab: "acknowledged" });
    q.value = "db";
    // Navigation runs the async route middleware first.
    await expect.poll(currentQuery).toEqual({ tab: "acknowledged", q: "db" });
  });

  it("drops the key when cleared", async () => {
    await mountAt({ q: "db" });
    q.value = "";
    // Navigation runs the async route middleware first.
    await expect.poll(currentQuery).toEqual({});
  });

  it("applies changes to several keys in the same tick together", async () => {
    await mountAt({ q: "db", status: "down" });
    q.value = "";
    status.value = "";
    // Navigation runs the async route middleware first.
    await expect.poll(currentQuery).toEqual({});
  });

  it("follows URL changes made elsewhere", async () => {
    await mountAt({});
    await useRouter().replace({ query: { q: "from-link" } });
    await flushPromises();
    expect(q.value).toBe("from-link");
  });
});

describe("useQueryList", () => {
  it("reads one or a repeated key as a list", async () => {
    await mountSuspended(Filters, { route: { path: "/login", query: { team: ["ops", "data"] } } });
    expect(teams.value).toEqual(["ops", "data"]);

    await useRouter().replace({ query: { team: "web" } });
    await flushPromises();
    expect(teams.value).toEqual(["web"]);
  });

  it("writes a repeated key, and drops it when emptied", async () => {
    await mountAt({ q: "db" });
    teams.value = ["ops", "data"];
    // Navigation runs the async route middleware first.
    await expect.poll(currentQuery).toEqual({ q: "db", team: ["ops", "data"] });

    teams.value = [];
    await expect.poll(currentQuery).toEqual({ q: "db" });
  });

  it("keeps the same list when other keys change", async () => {
    await mountSuspended(Filters, { route: { path: "/login", query: { team: ["ops"] } } });
    const before = teams.value;
    q.value = "db";
    await expect.poll(currentQuery).toEqual({ team: ["ops"], q: "db" });
    expect(teams.value).toBe(before);
  });
});
