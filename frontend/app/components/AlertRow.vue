<script setup lang="ts">
import type { Alert, AlertAction } from "~/types/alerts";

// checking: a "check now" for this alert's metric is waiting for its reading.
// hideHost: the list is already for one resource, so the host column is left out.
const props = defineProps<{ alert: Alert; now: number; checking: boolean; hideHost?: boolean }>();
const emit = defineEmits<{
  action: [alert: Alert, action: AlertAction];
  check: [alert: Alert];
  open: [alert: Alert];
}>();

// No reading to show or re-check: the host isn't reporting.
const hostDown = computed(() => isHostDown(props.alert));

const openedAt = computed(() => new Date(props.alert.openedAt));

const openedAgo = computed(() => formatAgo(openedAt.value, props.now));

// Resolved alerts are history: their times replace the actions.
const resolvedAt = computed(() =>
  props.alert.resolvedAt ? new Date(props.alert.resolvedAt) : null,
);
const duration = computed(() =>
  resolvedAt.value ? formatDuration(openedAt.value, resolvedAt.value) : null,
);

function withUnit(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return props.alert.metric.unit
    ? `${rounded} ${props.alert.metric.unit}`
    : String(rounded);
}

// Most recent reading; the value that opened the alert is on hover.
const value = computed(() =>
  hostDown.value
    ? "down"
    : withUnit(props.alert.lastValue ?? props.alert.triggeredValue),
);
const valueTitle = computed(() => {
  if (hostDown.value) {
    return undefined;
  }
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
    <td v-if="!hideHost" class="whitespace-nowrap px-4 py-2.5 font-mono text-highlighted">
      {{ alert.hostName }}
    </td>
    <td class="px-4 py-2.5 text-toned">{{ alert.responsibleTeam }}</td>
    <td class="whitespace-nowrap px-4 py-2.5 font-mono">
      {{ hostDown ? "Host down" : alert.metric.metricKey }}
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
    <template v-if="alert.status === 'resolved'">
      <td class="whitespace-nowrap px-4 py-2.5 text-muted">
        <time
          v-if="resolvedAt"
          :datetime="alert.resolvedAt!"
          :title="resolvedAt.toLocaleString()"
          >{{ formatAgo(resolvedAt, now) }}</time
        >
      </td>
      <td class="whitespace-nowrap px-4 py-2.5 tabular-nums text-toned">
        {{ duration }}
      </td>
    </template>
    <td v-else class="whitespace-nowrap px-4 py-2.5" @click.stop>
      <span class="inline-flex gap-1">
        <ActionButton
          v-if="!hostDown"
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
