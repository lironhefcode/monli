<script setup lang="ts">
import type { CatalogMetric, Condition, MetricDefaultsInput, Priority } from "~/types/monitoring";

// Edits a catalog metric's suggested policy. Forward-only: it pre-fills metrics
// added to templates later; existing template metrics keep their own values.
const props = defineProps<{ metric: CatalogMetric; saving?: boolean }>();

const emit = defineEmits<{
  submit: [input: MetricDefaultsInput];
  cancel: [];
}>();

const form = reactive({
  condition: (props.metric.defaultCondition ?? "gt") as Condition,
  warning_threshold: (props.metric.defaultWarningThreshold ?? "") as number | "",
  critical_threshold: (props.metric.defaultCriticalThreshold ?? "") as number | "",
  priority: (props.metric.defaultPriority ?? "p3") as Priority,
  alert_subject: props.metric.defaultAlertSubject ?? "",
});

// Unchecking only disables the input, so re-checking brings the typed value back.
const levelOn = reactive({
  warning: form.warning_threshold !== "",
  critical: form.critical_threshold !== "",
});

// Both levels off: templates that add this metric start monitor only.
const monitorOnly = computed(() => !levelOn.warning && !levelOn.critical);

const priorityOptions = ["p1", "p2", "p3", "p4"].map((value) => ({ label: value.toUpperCase(), value }));

const warning = computed(() => (levelOn.warning ? toThreshold(form.warning_threshold) : null));
const critical = computed(() => (levelOn.critical ? toThreshold(form.critical_threshold) : null));

const thresholdError = computed(() =>
  thresholdProblem(form.condition, levelOn.warning, warning.value, levelOn.critical, critical.value)
);

function submit() {
  if (thresholdError.value) return;
  emit("submit", {
    default_condition: form.condition,
    default_warning_threshold: warning.value,
    default_critical_threshold: critical.value,
    default_priority: form.priority,
    default_alert_subject: form.alert_subject.trim() || null,
  });
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <p class="font-mono text-highlighted">{{ metric.metricKey }}</p>

    <UFormField label="Alert when value is">
      <USelect v-model="form.condition" :items="[...conditionOptions]" :disabled="monitorOnly" class="w-full sm:w-1/2" />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-2">
        <UCheckbox v-model="levelOn.warning" label="Warning" />
        <UFormField label="Warning threshold" :hint="metric.unit ?? undefined">
          <UInput v-model.number="form.warning_threshold" type="number" step="any" :disabled="!levelOn.warning" class="w-full" :ui="{ base: 'disabled:bg-elevated disabled:text-dimmed' }" />
        </UFormField>
      </div>
      <div class="space-y-2">
        <UCheckbox v-model="levelOn.critical" label="Critical" />
        <UFormField label="Critical threshold" :hint="metric.unit ?? undefined">
          <UInput v-model.number="form.critical_threshold" type="number" step="any" :disabled="!levelOn.critical" class="w-full" :ui="{ base: 'disabled:bg-elevated disabled:text-dimmed' }" />
        </UFormField>
      </div>
    </div>
    <p v-if="thresholdError" class="-mt-2 text-error">{{ thresholdError }}</p>
    <p v-else-if="monitorOnly" class="-mt-2 text-muted">Monitor only: templates that add this metric won't alert on it.</p>

    <UFormField label="Priority">
      <USelect v-model="form.priority" :items="priorityOptions" :disabled="monitorOnly" class="w-full sm:w-1/3" />
    </UFormField>
    <UFormField label="Alert subject">
      <UInput v-model="form.alert_subject" :placeholder="defaultAlertSubject(metric.deviceKind)" :disabled="monitorOnly" class="w-full" />
    </UFormField>

    <p class="text-muted">Changes apply to templates that add this metric from now on. Templates already using it keep their settings.</p>

    <div class="flex gap-2 pt-2">
      <UButton type="submit" label="Save changes" :loading="saving" :disabled="thresholdError !== null" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
