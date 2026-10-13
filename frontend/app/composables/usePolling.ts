// Calls `tick` every `intervalMs` while the component is mounted. Pauses while
// the browser tab is hidden and ticks once as soon as it's visible again.
export function usePolling(tick: () => void, intervalMs: number) {
  let timer: ReturnType<typeof setInterval> | undefined;

  function start() {
    stop();
    timer = setInterval(tick, intervalMs);
  }

  function stop() {
    clearInterval(timer);
    timer = undefined;
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stop();
    } else {
      tick();
      start();
    }
  }

  onMounted(() => {
    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onBeforeUnmount(() => {
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}
