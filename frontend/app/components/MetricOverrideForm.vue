<script setup lang="ts">
import type { TemplateMetric, TemplateMetricInput } from "~/types/monitoring";
import type { TargetMetric } from "~/types/targets";

// One switch for the whole metric: follow the template, or a full custom copy
// for this resource that template edits no longer reach.
const props = defineProps<{ metric: TargetMetric; saving?: boolean }>();

const emit = defineEmits<{
  save: [input: TemplateMetricInput];
  reset: [];
  cancel: [];
}>();

const customized = ref(props.metric.overridden);

// Starts from the policy the resource uses now. The team starts blank unless
// it was customized, so the resource's own team keeps applying.
const initial = computed<TemplateMetric>(() => ({
  id: props.metric.metric.id,
  metricId: props.metric.metric.id,
  reportIntervalSec: props.metric.reportIntervalSec,
  condition: props.metric.condition,
  warningThreshold: props.metric.warningThreshold,
  criticalThreshold: props.metric.criticalThreshold,
  consecutiveBreaches: props.metric.consecutiveBreaches,
  responsibleTeam: props.metric.customTeam,
  alertSubject: props.metric.alertSubject,
  alertDescription: props.metric.alertDescription,
  priority: props.metric.priority,
  metric: props.metric.metric,
}));

function saveTemplate() {
  // Already following the template: nothing to change.
  if (props.metric.overridden) emit("reset");
  else emit("cancel");
}
</script>

<template>
  <div class="space-y-4">
    <USwitch
      v-model="customized"
      label="Customize for this resource"
      :description="`Off: uses the settings from template ${metric.source.name}. On: this resource keeps its own copy; template changes no longer apply to it.`"
    />

    <TemplateMetricForm
      v-if="customized"
      :initial="initial"
      :saving="saving"
      team-hint="Leave blank to use the resource's team"
      @submit="(_metricId, input) => emit('save', input)"
      @cancel="emit('cancel')"
    />

    <template v-else>
      <p class="font-mono text-highlighted">{{ metric.metric.metricKey }}</p>
      <p v-if="metric.overridden" class="text-muted">
        Saving discards this resource's custom settings and goes back to template {{ metric.source.name }}.
      </p>
      <div class="flex gap-2 pt-2">
        <UButton label="Save changes" :loading="saving" @click="saveTemplate" />
        <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
      </div>
    </template>
  </div>
</template>
