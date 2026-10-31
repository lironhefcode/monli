import { mountSuspended } from "@nuxt/test-utils/runtime";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { UApp } from "#components";
import ActionButton from "~/components/ActionButton.vue";
import AlertRow from "~/components/AlertRow.vue";
import LevelRules from "~/components/LevelRules.vue";
import TargetStatus from "~/components/TargetStatus.vue";
import type { Alert } from "~/types/alerts";
import type { UserRole } from "~/types/users";

describe("LevelRules", () => {
  it("shows each level that is on", async () => {
    const wrapper = await mountSuspended(LevelRules, {
      props: { condition: "gt", warningThreshold: 80, criticalThreshold: 90, unit: "%" },
    });
    const levels = wrapper.findAll("span.whitespace-nowrap").map((level) => level.findAll("span").map((part) => part.text()));
    expect(levels).toEqual([
      ["Warning", "> 80 %"],
      ["Critical", "> 90 %"],
    ]);
  });

  it("says monitor only without thresholds", async () => {
    const wrapper = await mountSuspended(LevelRules, {
      props: { condition: "gt", warningThreshold: null, criticalThreshold: null, unit: null },
    });
    expect(wrapper.text()).toBe("Monitor only");
  });
});

describe("TargetStatus", () => {
  it("labels the status and shows when it was last seen", async () => {
    const lastSeenAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const wrapper = await mountSuspended(TargetStatus, { props: { status: "down", lastSeenAt } });

    expect(wrapper.text()).toBe("Down");
    expect(wrapper.find("span").attributes("title")).toBe("Last seen 5 min ago");
    expect(wrapper.find("span").classes()).toContain("status-down");
  });

  it("says when a target never reported", async () => {
    const wrapper = await mountSuspended(TargetStatus, { props: { status: "unknown", lastSeenAt: null } });
    expect(wrapper.find("span").attributes("title")).toBe("Never reported");
  });
});

describe("ActionButton", () => {
  function signInAs(role: UserRole) {
    useAuth().user.value = { id: "u1", name: "Alice", email: "a@monli.test", role };
  }

  // UApp provides the tooltip context the button's UTooltip needs.
  async function button(props: Record<string, unknown> = {}) {
    const InApp = defineComponent(() => () => h(UApp, () => h(ActionButton, { label: "Resolve", ...props })));
    const wrapper = await mountSuspended(InApp);
    return wrapper.find("button");
  }

  beforeEach(() => {
    useAuth().user.value = undefined;
  });

  it.each<[UserRole, boolean]>([
    ["viewer", true],
    ["editor", false],
    ["admin", false],
  ])("editor action for a %s: disabled %s", async (role, disabled) => {
    signInAs(role);
    const found = await button();
    expect(found.text()).toBe("Resolve");
    expect(found.attributes("disabled") !== undefined).toBe(disabled);
  });

  it.each<[UserRole, boolean]>([
    ["editor", true],
    ["admin", false],
  ])("admin action for a %s: disabled %s", async (role, disabled) => {
    signInAs(role);
    const found = await button({ requires: "admin" });
    expect(found.attributes("disabled") !== undefined).toBe(disabled);
  });

  it("stays disabled when the caller disables it, whatever the role", async () => {
    signInAs("admin");
    const found = await button({ disabled: true });
    expect(found.attributes("disabled")).toBeDefined();
  });
});

describe("AlertRow", () => {
  const base: Alert = {
    id: 1,
    severity: "critical",
    priority: "p1",
    status: "open",
    subject: "web-1 is down",
    description: null,
    triggeredValue: 0,
    lastValue: 0,
    lastValueAt: null,
    openedAt: new Date().toISOString(),
    resolvedAt: null,
    responsibleTeam: "ops",
    hostName: "web-1",
    acknowledged: false,
    target: { id: 1, name: "web-1" },
    metric: { id: 9, metricKey: "host_up", unit: null },
    interface: null,
  };

  // UApp for the buttons' tooltips; a table so the row renders in place.
  async function row(alert: Alert) {
    const InTable = defineComponent(() => () =>
      h(UApp, () => h("table", [h("tbody", [h(AlertRow, { alert, now: Date.now(), checking: false })])])),
    );
    return (await mountSuspended(InTable)).find("tr");
  }

  it("shows a host-down alert without a value or a check button", async () => {
    const found = await row(base);
    const cells = found.findAll("td").map((cell) => cell.text());
    expect(cells[4]).toBe("Host down");
    expect(cells[5]).toBe("down");
    expect(found.findAll("button").map((b) => b.text())).toEqual(["Ack", "Resolve"]);
  });

  it("shows a metric alert's metric, value and check button", async () => {
    const found = await row({
      ...base,
      triggeredValue: 95,
      lastValue: 95,
      metric: { id: 2, metricKey: "cpu_utilization", unit: "%" },
    });
    const cells = found.findAll("td").map((cell) => cell.text());
    expect(cells[4]).toBe("cpu_utilization");
    expect(cells[5]).toBe("95 %");
    expect(found.findAll("button").map((b) => b.text())).toEqual(["Check", "Ack", "Resolve"]);
  });

  it("shows a resolved alert's resolved time and duration, without actions", async () => {
    const openedAt = new Date(Date.now() - 3 * 3600_000);
    const found = await row({
      ...base,
      status: "resolved",
      openedAt: openedAt.toISOString(),
      resolvedAt: new Date(openedAt.getTime() + 75 * 60_000).toISOString(),
    });
    const cells = found.findAll("td").map((cell) => cell.text());
    expect(cells[7]).toBe("3 h ago");
    expect(cells[8]).toBe("1 h ago");
    expect(cells[9]).toBe("1 h 15 min");
    expect(found.findAll("button")).toHaveLength(0);
  });
});
