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

// Threshold inputs hold "" while empty; whether a level is used is levelOn.
type FormState = Omit<TemplateMetricInput, "warning_threshold" | "critical_threshold"> & {
  warning_threshold: number | "";
  critical_threshold: number | "";
};

// API defaults, used where the catalog suggests nothing.
const fallback: FormState = {
  report_interval_sec: 60,
  condition: "gt",
  warning_threshold: "",
  critical_threshold: "",
  consecutive_breaches: 1,
  responsible_team: null,
  alert_subject: "",
  alert_description: null,
  priority: "p3",
};

function fromTemplateMetric(metric: TemplateMetric): FormState {
  return {
    report_interval_sec: metric.reportIntervalSec,
    condition: metric.condition,
    warning_threshold: metric.warningThreshold ?? "",
    critical_threshold: metric.criticalThreshold ?? "",
    consecutive_breaches: metric.consecutiveBreaches,
    responsible_team: metric.responsibleTeam,
    alert_subject: metric.alertSubject,
    alert_description: metric.alertDescription,
    priority: metric.priority,
  };
}

function fromCatalog(metric: CatalogMetric): FormState {
  return {
    ...fallback,
    report_interval_sec: metric.defaultReportIntervalSec ?? fallback.report_interval_sec,
    condition: metric.defaultCondition ?? fallback.condition,
    warning_threshold: metric.defaultWarningThreshold ?? "",
    critical_threshold: metric.defaultCriticalThreshold ?? "",
    priority: metric.defaultPriority ?? fallback.priority,
  };
}

const metricId = ref<number | undefined>(props.initial?.metricId);
const form = reactive<FormState>(props.initial ? fromTemplateMetric(props.initial) : { ...fallback });

// A level is on when it starts with a value. Unchecking only disables the input,
// so re-checking brings the typed value back; unchecked levels save as null.
const levelOn = reactive({
  warning: form.warning_threshold !== "",
  critical: form.critical_threshold !== "",
});

const metricOptions = computed(() =>
  (props.availableMetrics ?? []).map((metric) => ({ label: metric.metricKey, value: metric.id }))
);

const selectedMetric = computed(() => props.availableMetrics?.find((metric) => metric.id === metricId.value));
const unit = computed(() => (props.initial?.metric ?? selectedMetric.value)?.unit ?? null);

// Picking a metric replaces the fields with its suggested defaults.
watch(selectedMetric, (metric) => {
  if (!metric || isEdit.value) return;
  Object.assign(form, fromCatalog(metric));
  levelOn.warning = form.warning_threshold !== "";
  levelOn.critical = form.critical_threshold !== "";
});

const priorityOptions = ["p1", "p2", "p3", "p4"].map((value) => ({ label: value.toUpperCase(), value }));

function toThreshold(value: number | ""): number | null {
  return value === "" || !Number.isFinite(value) ? null : value;
}

const warning = computed(() => (levelOn.warning ? toThreshold(form.warning_threshold) : null));
const critical = computed(() => (levelOn.critical ? toThreshold(form.critical_threshold) : null));

// Mirrors the API's rule so the problem shows before saving.
const thresholdError = computed(() => {
  if (!levelOn.warning && !levelOn.critical) return "Turn on warning, critical, or both.";
  if (levelOn.warning && warning.value === null) return "Enter a warning threshold.";
  if (levelOn.critical && critical.value === null) return "Enter a critical threshold.";
  if (warning.value === null || critical.value === null) return null;
  if ((form.condition === "gt" || form.condition === "gte") && warning.value >= critical.value) {
    return "Warning must be lower than critical.";
  }
  if ((form.condition === "lt" || form.condition === "lte") && warning.value <= critical.value) {
    return "Warning must be higher than critical.";
  }
  return null;
});

const valid = computed(
  () =>
    metricId.value !== undefined &&
    thresholdError.value === null &&
    form.report_interval_sec >= 1 &&
    form.consecutive_breaches >= 1
);

function submit() {
  if (!valid.value || metricId.value === undefined) return;
  emit("submit", metricId.value, {
    ...form,
    warning_threshold: warning.value,
    critical_threshold: critical.value,
    responsible_team: form.responsible_team?.trim() || null,
    alert_subject: form.alert_subject.trim(),
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
      <UFormField label="Alert when value is">
        <USelect v-model="form.condition" :items="[...conditionOptions]" class="w-full sm:w-1/2" />
      </UFormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <UCheckbox v-model="levelOn.warning" label="Warning" />
          <UFormField label="Warning threshold" :hint="unit ?? undefined">
            <UInput v-model.number="form.warning_threshold" type="number" step="any" :disabled="!levelOn.warning" class="w-full" :ui="{ base: 'disabled:bg-elevated disabled:text-dimmed' }" />
          </UFormField>
        </div>
        <div class="space-y-2">
          <UCheckbox v-model="levelOn.critical" label="Critical" />
          <UFormField label="Critical threshold" :hint="unit ?? undefined">
            <UInput v-model.number="form.critical_threshold" type="number" step="any" :disabled="!levelOn.critical" class="w-full" :ui="{ base: 'disabled:bg-elevated disabled:text-dimmed' }" />
          </UFormField>
        </div>
      </div>
      <p v-if="thresholdError" class="-mt-2 text-error">{{ thresholdError }}</p>

      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Priority">
          <USelect v-model="form.priority" :items="priorityOptions" class="w-full" />
        </UFormField>
        <UFormField label="Report every" hint="seconds">
          <UInput v-model.number="form.report_interval_sec" type="number" min="1" class="w-full" />
        </UFormField>
        <UFormField label="Breaches for alert">
          <UInput v-model.number="form.consecutive_breaches" type="number" min="1" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Alert subject">
        <UInput v-model="form.alert_subject" :placeholder="defaultAlertSubject" class="w-full" />
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
