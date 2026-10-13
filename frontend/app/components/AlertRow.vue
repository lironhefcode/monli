<script setup lang="ts">
import type { Alert } from "~/types/alerts";

const props = defineProps<{ alert: Alert; now: number }>();

const openedAt = computed(() => new Date(props.alert.openedAt));

const openedAgo = computed(() => formatAgo(openedAt.value, props.now));

const value = computed(() => {
  const unit = props.alert.metric.unit;
  return unit ? `${props.alert.triggeredValue} ${unit}` : String(props.alert.triggeredValue);
});
</script>

<template>
  <tr class="border-b border-default last:border-b-0" :class="`severity-${alert.severity}`">
    <td class="rail py-2.5 pl-3 pr-4">
      <span class="severity-label font-medium">{{ alert.severity === "critical" ? "Critical" : "Warning" }}</span>
    </td>
    <td class="px-4 py-2.5 text-toned">{{ alert.priority.toUpperCase() }}</td>
    <td class="px-4 py-2.5 font-mono text-highlighted">{{ alert.target.name }}</td>
    <td class="px-4 py-2.5 text-toned">{{ alert.responsibleTeam }}</td>
    <td class="px-4 py-2.5 font-mono">{{ alert.metric.metricKey }}</td>
    <td class="px-4 py-2.5 font-mono tabular-nums">{{ value }}</td>
    <td class="px-4 py-2.5 text-highlighted">
      {{ alert.subject }}
      <span v-if="alert.description" class="block text-muted">{{ alert.description }}</span>
    </td>
    <td class="whitespace-nowrap px-4 py-2.5 text-muted">
      <time :datetime="alert.openedAt" :title="openedAt.toLocaleString()">{{ openedAgo }}</time>
    </td>
    <td class="px-4 py-2.5">
      <UTooltip text="Available once sign-in is added">
        <!-- Disabled buttons swallow hover events; the span keeps the tooltip working. -->
        <span class="inline-flex gap-1" tabindex="0">
          <UButton label="Ack" size="xs" color="neutral" variant="outline" disabled />
          <UButton label="Resolve" size="xs" color="neutral" variant="outline" disabled />
        </span>
      </UTooltip>
    </td>
  </tr>
</template>

<style scoped>
/* Status rail: the row's left edge carries its severity colour. */
.rail {
  box-shadow: inset 3px 0 0 var(--severity-color);
}

.severity-label {
  color: var(--severity-color);
}

.severity-critical {
  --severity-color: var(--color-status-crit);
}

.severity-warning {
  --severity-color: var(--color-status-warn);
}
</style>
