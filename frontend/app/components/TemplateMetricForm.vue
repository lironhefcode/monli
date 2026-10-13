<script setup lang="ts">
import type { CatalogMetric, TemplateMetric, TemplateMetricInput } from "~/types/monitoring";

// Add mode: pick a metric, fields pre-fill from its catalog defaults.
// Edit mode: fields start from the template's current policy.
const props = defineProps<{
  availableMetrics?: CatalogMetric[];
  initial?: TemplateMetric;
  saving?: boolean;
}>();

const emit = defineEmits<{
  submit: [metricId: number, input: TemplateMetricInput];
  cancel: [];
}>();

const isEdit = computed(() => props.initial !== undefined);

// API defaults, used where the catalog suggests nothing.
const fallback: TemplateMetricInput = {
  report_interval_sec: 60,
  condition: "gt",
  threshold: 0,
  consecutive_breaches: 1,
  severity: "warning",
  responsible_team: null,
  alert_subject: "",
  alert_description: null,
  priority: "p3",
};

function fromTemplateMetric(metric: TemplateMetric): TemplateMetricInput {
  return {
    report_interval_sec: metric.reportIntervalSec,
    condition: metric.condition,
    threshold: metric.threshold,
    consecutive_breaches: metric.consecutiveBreaches,
    severity: metric.severity,
    responsible_team: metric.responsibleTeam,
    alert_subject: metric.alertSubject,
    alert_description: metric.alertDescription,
    priority: metric.priority,
  };
}

function fromCatalog(metric: CatalogMetric): TemplateMetricInput {
  return {
    ...fallback,
    report_interval_sec: metric.defaultReportIntervalSec ?? fallback.report_interval_sec,
    condition: metric.defaultCondition ?? fallback.condition,
    threshold: metric.defaultThreshold ?? fallback.threshold,
    severity: metric.defaultSeverity ?? fallback.severity,
    priority: metric.defaultPriority ?? fallback.priority,
  };
}

const metricId = ref<number | undefined>(props.initial?.metricId);
const form = reactive<TemplateMetricInput>(props.initial ? fromTemplateMetric(props.initial) : { ...fallback });

const metricOptions = computed(() =>
  (props.availableMetrics ?? []).map((metric) => ({ label: metric.metricKey, value: metric.id }))
);

const selectedMetric = computed(() => props.availableMetrics?.find((metric) => metric.id === metricId.value));
const unit = computed(() => (props.initial?.metric ?? selectedMetric.value)?.unit ?? null);

// Picking a metric replaces the fields with its suggested defaults.
watch(selectedMetric, (metric) => {
  if (metric && !isEdit.value) Object.assign(form, fromCatalog(metric));
});

const severityOptions = [
  { label: "Warning", value: "warning" },
  { label: "Critical", value: "critical" },
];
const priorityOptions = ["p1", "p2", "p3", "p4"].map((value) => ({ label: value.toUpperCase(), value }));

const valid = computed(
  () =>
    metricId.value !== undefined &&
    Number.isFinite(form.threshold) &&
    form.report_interval_sec >= 1 &&
    form.consecutive_breaches >= 1
);

function submit() {
  if (!valid.value || metricId.value === undefined) return;
  emit("submit", metricId.value, {
    ...form,
    responsible_team: form.responsible_team?.trim() || null,
    alert_description: form.alert_description?.trim() || null,
  });
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UFormField v-if="!isEdit" label="Metric" required>
      <USelect v-model="metricId" :items="metricOptions" placeholder="Choose a metric" class="w-full" />
    </UFormField>
    <p v-else class="font-mono text-highlighted">{{ initial?.metric.metricKey }}</p>

    <fieldset :disabled="metricId === undefined" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Alert when value is">
          <USelect v-model="form.condition" :items="[...conditionOptions]" class="w-full" />
        </UFormField>
        <UFormField label="Threshold" :hint="unit ?? undefined">
          <UInput v-model.number="form.threshold" type="number" step="any" class="w-full" />
        </UFormField>
        <UFormField label="Severity">
          <USelect v-model="form.severity" :items="severityOptions" class="w-full" />
        </UFormField>
        <UFormField label="Priority">
          <USelect v-model="form.priority" :items="priorityOptions" class="w-full" />
        </UFormField>
        <UFormField label="Report every" hint="seconds">
          <UInput v-model.number="form.report_interval_sec" type="number" min="1" class="w-full" />
        </UFormField>
        <UFormField label="Breaches before alerting" hint="consecutive readings">
          <UInput v-model.number="form.consecutive_breaches" type="number" min="1" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Alert subject">
        <UInput v-model="form.alert_subject" placeholder="CPU usage above 90%" class="w-full" />
      </UFormField>
      <UFormField label="Alert description">
        <UTextarea v-model="form.alert_description" :rows="2" class="w-full" />
      </UFormField>
      <UFormField label="Responsible team" hint="Used when the resource has no team">
        <UInput v-model="form.responsible_team" class="w-full max-w-xs" />
      </UFormField>
    </fieldset>

    <div class="flex gap-2 pt-2">
      <UButton type="submit" :label="isEdit ? 'Save changes' : 'Add metric'" :loading="saving" :disabled="!valid" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
