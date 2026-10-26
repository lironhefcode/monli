import { mountSuspended } from "@nuxt/test-utils/runtime";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { UApp } from "#components";
import ActionButton from "~/components/ActionButton.vue";
import LevelRules from "~/components/LevelRules.vue";
import TargetStatus from "~/components/TargetStatus.vue";
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
