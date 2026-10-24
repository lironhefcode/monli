<script setup lang="ts">
import type { Alert, AlertAction } from "~/types/alerts";

// checking: a "check now" for this alert's metric is waiting for its reading.
const props = defineProps<{ alert: Alert; now: number; checking: boolean }>();
const emit = defineEmits<{
  action: [alert: Alert, action: AlertAction];
  check: [alert: Alert];
  open: [alert: Alert];
}>();

const openedAt = computed(() => new Date(props.alert.openedAt));

const openedAgo = computed(() => formatAgo(openedAt.value, props.now));

function withUnit(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return props.alert.metric.unit
    ? `${rounded} ${props.alert.metric.unit}`
    : String(rounded);
}

// Most recent reading; the value that opened the alert is on hover.
const value = computed(() =>
  withUnit(props.alert.lastValue ?? props.alert.triggeredValue),
);
const valueTitle = computed(() => {
  const updated = props.alert.lastValueAt
    ? `, updated ${formatAgo(props.alert.lastValueAt, props.now)}`
    : "";
  return `Triggered at ${withUnit(props.alert.triggeredValue)}${updated}`;
});
</script>

<template>
  <!-- Row click opens the comments; the actions cell stops the click so buttons only run their action. -->
  <tr
    class="cursor-pointer border-b border-default last:border-b-0 hover:bg-elevated/50"
    :class="`severity-${alert.severity}`"
    @click="emit('open', alert)"
  >
    <td class="rail py-2.5 pl-3 pr-4">
      <span class="severity-label font-medium">{{
        alert.severity === "critical" ? "Critical" : "Warning"
      }}</span>
    </td>
    <td class="px-4 py-2.5 text-toned">{{ alert.priority.toUpperCase() }}</td>
    <td class="whitespace-nowrap px-4 py-2.5 font-mono text-highlighted">
      {{ alert.hostName }}
    </td>
    <td class="px-4 py-2.5 text-toned">{{ alert.responsibleTeam }}</td>
    <td class="whitespace-nowrap px-4 py-2.5 font-mono">
      {{ alert.metric.metricKey }}
    </td>
    <td
      class="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums"
      :title="valueTitle"
    >
      {{ value }}
    </td>
    <td class="px-4 py-2.5 text-highlighted">
      {{ alert.subject }}
    </td>
    <td class="whitespace-nowrap px-4 py-2.5 text-muted">
      <time :datetime="alert.openedAt" :title="openedAt.toLocaleString()">{{
        openedAgo
      }}</time>
    </td>
    <td class="whitespace-nowrap px-4 py-2.5" @click.stop>
      <span class="inline-flex gap-1">
        <ActionButton
          label="Check"
          size="xs"
          color="neutral"
          variant="outline"
          :loading="checking"
          @click="emit('check', alert)"
        />
        <ActionButton
          :label="alert.acknowledged ? 'Unack' : 'Ack'"
          size="xs"
          color="neutral"
          variant="outline"
          @click="emit('action', alert, alert.acknowledged ? 'unack' : 'ack')"
        />
        <ActionButton
          label="Resolve"
          size="xs"
          color="neutral"
          variant="outline"
          @click="emit('action', alert, 'resolve')"
        />
      </span>
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
