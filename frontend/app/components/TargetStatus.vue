<script setup lang="ts">
import type { TargetStatus } from "~/types/targets";

const props = defineProps<{ status: TargetStatus; lastSeenAt: string | null }>();

const labels: Record<TargetStatus, string> = { up: "Up", down: "Down", unknown: "Unknown" };

const title = computed(() =>
  props.lastSeenAt ? `Last seen ${formatAgo(props.lastSeenAt)}` : "Never reported"
);
</script>

<template>
  <span class="inline-flex items-center gap-2 font-medium" :class="`status-${status}`" :title="title">
    <span class="dot size-2 rounded-full" aria-hidden="true" />
    {{ labels[status] }}
  </span>
</template>

<style scoped>
.status-up {
  --status-color: var(--color-status-ok);
}

.status-down {
  --status-color: var(--color-status-crit);
}

.status-unknown {
  --status-color: var(--color-status-unknown);
}

.status-up,
.status-down,
.status-unknown {
  color: var(--status-color);
}

.dot {
  background: var(--status-color);
}
</style>
