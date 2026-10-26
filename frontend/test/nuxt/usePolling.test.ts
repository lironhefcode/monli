import { mountSuspended } from "@nuxt/test-utils/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

let hidden = false;

function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

async function mountPoller(tick: () => void) {
  const Poller = defineComponent({
    setup() {
      usePolling(tick, 1000);
      return () => h("div");
    },
  });
  return mountSuspended(Poller);
}

// document.hidden is stubbed per test; the original is put back afterwards.
let originalHidden: PropertyDescriptor | undefined;

beforeEach(() => {
  hidden = false;
  originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  // Only intervals: mountSuspended waits on real timeouts and microtasks, and
  // faking those too can stall the mount.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalHidden) {
    Object.defineProperty(document, "hidden", originalHidden);
  } else {
    // Own property removed: the getter on Document's prototype applies again.
    Reflect.deleteProperty(document, "hidden");
  }
});

describe("usePolling", () => {
  it("ticks on every interval while mounted", async () => {
    const tick = vi.fn();
    await mountPoller(tick);

    expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("pauses while the tab is hidden and ticks right away when it's visible again", async () => {
    const tick = vi.fn();
    await mountPoller(tick);

    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();

    setHidden(false);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("stops on unmount", async () => {
    const tick = vi.fn();
    const wrapper = await mountPoller(tick);

    wrapper.unmount();
    vi.advanceTimersByTime(5000);
    setHidden(true);
    setHidden(false);
    expect(tick).not.toHaveBeenCalled();
  });
});
