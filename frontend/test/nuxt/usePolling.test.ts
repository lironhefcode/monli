import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

let hidden = false;

function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

// usePolling only needs Vue's lifecycle hooks, so a plain synchronous mount
// will do: mountSuspended boots the Nuxt app, which can outlast the test
// timeout on a busy machine.
let wrapper: VueWrapper | undefined;

function mountPoller(tick: () => void) {
  const Poller = defineComponent({
    setup() {
      usePolling(tick, 1000);
      return () => h("div");
    },
  });
  wrapper = mount(Poller);
  return wrapper;
}

// document.hidden is stubbed per test; the original is put back afterwards.
let originalHidden: PropertyDescriptor | undefined;

beforeEach(() => {
  hidden = false;
  originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  vi.useFakeTimers();
});

afterEach(() => {
  // Unmounting stops the poller, so no interval leaks into the next test.
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  if (originalHidden) {
    Object.defineProperty(document, "hidden", originalHidden);
  } else {
    // Own property removed: the getter on Document's prototype applies again.
    Reflect.deleteProperty(document, "hidden");
  }
});

describe("usePolling", () => {
  it("ticks on every interval while mounted", () => {
    const tick = vi.fn();
    mountPoller(tick);

    expect(tick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("pauses while the tab is hidden and ticks right away when it's visible again", () => {
    const tick = vi.fn();
    mountPoller(tick);

    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();

    setHidden(false);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("stops on unmount", () => {
    const tick = vi.fn();
    mountPoller(tick).unmount();
    wrapper = undefined;

    vi.advanceTimersByTime(5000);
    setHidden(true);
    setHidden(false);
    expect(tick).not.toHaveBeenCalled();
  });
});
