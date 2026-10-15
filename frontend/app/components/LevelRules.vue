<script setup lang="ts">
import type { Condition } from "~/types/monitoring";

const props = defineProps<{
  condition: Condition;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  unit: string | null;
}>();

const levels = computed(() =>
  formatLevels(props.condition, props.warningThreshold, props.criticalThreshold, props.unit)
);
</script>

<template>
  <span v-if="levels.length" class="inline-flex flex-wrap gap-x-4 gap-y-1">
    <span v-for="item in levels" :key="item.level" class="whitespace-nowrap">
      <span :class="item.level === 'critical' ? 'text-error' : 'text-warning'">
        {{ item.level === "critical" ? "Critical" : "Warning" }}
      </span>
      <span class="ml-1.5 font-mono tabular-nums">{{ item.rule }}</span>
    </span>
  </span>
  <span v-else>—</span>
</template>
