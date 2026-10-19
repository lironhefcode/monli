<script setup lang="ts">
import type { CatalogMetric, TemplateDetail, TemplateMetric, TemplateMetricInput } from "~/types/monitoring";

const route = useRoute();
const templateId = computed(() => Number(route.params.id));

const { data: template, error, refresh } = useFetch<TemplateDetail>(() => `/api/templates/${templateId.value}`);
const { data: catalog } = useFetch<CatalogMetric[]>("/api/metrics");

const notFound = computed(() => error.value?.statusCode === 404);

// Only offer metrics not already in the template (the API answers 409 otherwise).
const availableMetrics = computed(() => {
  const inTemplate = new Set(template.value?.metrics.map((metric) => metric.metricId));
  return (catalog.value ?? []).filter((metric) => !inTemplate.has(metric.id));
});

const toast = useToast();

// One modal for both add and edit; `editing` decides which.
const modalOpen = ref(false);
const editing = ref<TemplateMetric | undefined>();
const saving = ref(false);
const removingId = ref<number | null>(null);

function openAdd() {
  editing.value = undefined;
  modalOpen.value = true;
}

function openEdit(metric: TemplateMetric) {
  editing.value = metric;
  modalOpen.value = true;
}

async function save(metricId: number, input: TemplateMetricInput) {
  saving.value = true;
  try {
    if (editing.value) {
      await $fetch(`/api/templates/${templateId.value}/metrics/${metricId}`, { method: "PATCH", body: input });
    } else {
      await $fetch(`/api/templates/${templateId.value}/metrics`, {
        method: "POST",
        body: { ...input, metric_id: metricId, responsible_team: input.responsible_team ?? undefined, alert_description: input.alert_description ?? undefined },
      });
    }
    modalOpen.value = false;
    await refresh();
  } catch (err) {
    toast.add({
      title: editing.value ? "Couldn't save changes" : "Couldn't add metric",
      description: apiErrorMessage(err),
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

async function remove(metric: TemplateMetric) {
  removingId.value = metric.metricId;
  try {
    await $fetch(`/api/templates/${templateId.value}/metrics/${metric.metricId}`, { method: "DELETE" });
    await refresh();
  } catch (err) {
    toast.add({ title: "Couldn't remove metric", description: apiErrorMessage(err), color: "error" });
  } finally {
    removingId.value = null;
  }
}

const resourcesLabel = computed(() => {
  const count = template.value?.targetCount ?? 0;
  return count === 1 ? "1 resource" : `${count} resources`;
});
</script>

<template>
  <div class="max-w-5xl">
    <NuxtLink to="/monitoring?tab=templates" class="text-muted hover:text-highlighted">Templates</NuxtLink>

    <div v-if="notFound" class="mt-4 rounded-(--ui-radius) border border-default bg-muted px-4 py-6">
      <p class="text-highlighted">Template not found.</p>
      <NuxtLink to="/monitoring?tab=templates" class="text-primary hover:underline">Back to templates</NuxtLink>
    </div>

    <UAlert
      v-else-if="error"
      class="mt-4"
      color="error"
      variant="subtle"
      title="Couldn't load this template"
      description="Check that the API is running, then reload the page."
    />

    <p v-else-if="!template" class="mt-4 text-muted">Loading…</p>

    <template v-else>
      <header class="mt-2 border-b border-default pb-4">
        <h1 class="text-xl font-semibold text-highlighted">{{ template.name }}</h1>
        <p v-if="template.description" class="mt-1 text-muted">{{ template.description }}</p>
      </header>

      <section aria-labelledby="metrics-title" class="mt-6 rounded-(--ui-radius) border border-default bg-muted">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3">
          <div>
            <h2 id="metrics-title" class="text-base font-semibold text-highlighted">Metrics</h2>
            <p class="text-muted">Changes apply to the {{ resourcesLabel }} using this template.</p>
          </div>
          <ActionButton label="Add metric" :disabled="!catalog || availableMetrics.length === 0" @click="openAdd" />
        </header>

        <p v-if="template.metrics.length === 0" class="px-4 py-3 text-muted">
          No metrics yet. Add one to start monitoring it on every resource that uses this template.
        </p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="border-b border-default text-muted">
              <tr>
                <th scope="col" class="py-2 pl-4 pr-4 font-medium">Metric</th>
                <th scope="col" class="px-4 py-2 font-medium">Alert when</th>
                <th scope="col" class="px-4 py-2 font-medium">Priority</th>
                <th scope="col" class="px-4 py-2 font-medium">Interval</th>
                <th scope="col" class="px-4 py-2 font-medium">Subject</th>
                <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="metric in template.metrics" :key="metric.id" class="border-b border-default last:border-b-0">
                <td class="py-2.5 pl-4 pr-4 font-mono text-highlighted">{{ metric.metric.metricKey }}</td>
                <td class="px-4 py-2.5">
                  <LevelRules
                    :condition="metric.condition"
                    :warning-threshold="metric.warningThreshold"
                    :critical-threshold="metric.criticalThreshold"
                    :unit="metric.metric.unit"
                  />
                  <span v-if="metric.consecutiveBreaches > 1" class="block text-muted">
                    after {{ metric.consecutiveBreaches }} readings in a row
                  </span>
                </td>
                <td class="px-4 py-2.5 text-toned">{{ metric.priority.toUpperCase() }}</td>
                <td class="px-4 py-2.5 tabular-nums">{{ metric.reportIntervalSec }} s</td>
                <td class="px-4 py-2.5">
                  <span v-if="metric.alertSubject">{{ metric.alertSubject }}</span>
                  <span v-else class="text-muted">Default message</span>
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right">
                  <ActionButton label="Edit" size="xs" color="neutral" variant="outline" @click="openEdit(metric)" />
                  <ActionButton
                    label="Remove"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    class="ml-1"
                    :loading="removingId === metric.metricId"
                    @click="remove(metric)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <UModal v-model:open="modalOpen" :title="editing ? 'Edit metric' : 'Add metric'" :ui="{ content: 'sm:max-w-3xl' }">
        <template #body>
          <!-- Keyed so each open starts from fresh form state. -->
          <TemplateMetricForm
            :key="editing?.id ?? 'new'"
            :initial="editing"
            :available-metrics="availableMetrics"
            :saving="saving"
            @submit="save"
            @cancel="modalOpen = false"
          />
        </template>
      </UModal>
    </template>
  </div>
</template>
