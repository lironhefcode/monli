<script setup lang="ts">
import type { CatalogMetric, MetricDefaultsInput } from "~/types/monitoring";
import type { TemplateSummary } from "~/types/targets";

const route = useRoute();
const router = useRouter();

// The selected tab lives in the URL, so reloads and shared links keep it.
const tabs = [
  { label: "Metrics", value: "metrics" },
  { label: "Templates", value: "templates" },
];
const tab = computed({
  get: () => (route.query.tab === "templates" ? "templates" : "metrics"),
  set: (value: string) => router.replace({ query: { ...route.query, tab: value } }),
});

const { data: metrics, error: metricsError, refresh: refreshMetrics } = useFetch<CatalogMetric[]>("/api/metrics");
const { data: templates, error: templatesError, refresh: refreshTemplates } =
  useFetch<TemplateSummary[]>("/api/templates");

// New template form.
const toast = useToast();
const creating = ref(false);
const newName = ref("");
const newDescription = ref("");
const saving = ref(false);

function cancelCreate() {
  creating.value = false;
  newName.value = "";
  newDescription.value = "";
}

async function createTemplate() {
  if (!newName.value.trim()) return;
  saving.value = true;
  try {
    const template = await $fetch<TemplateSummary>("/api/templates", {
      method: "POST",
      body: { name: newName.value.trim(), description: newDescription.value.trim() || undefined },
    });
    cancelCreate();
    await refreshTemplates();
    toast.add({ title: "Template created", description: template.name, color: "success" });
  } catch (err) {
    toast.add({ title: "Couldn't create template", description: apiErrorMessage(err), color: "error" });
  } finally {
    saving.value = false;
  }
}

// Edit a catalog metric's defaults in a modal.
const editingMetric = ref<CatalogMetric | null>(null);
const editOpen = computed({
  get: () => editingMetric.value !== null,
  set: (open: boolean) => {
    if (!open) editingMetric.value = null;
  },
});
const savingDefaults = ref(false);

async function saveDefaults(input: MetricDefaultsInput) {
  if (!editingMetric.value) return;
  savingDefaults.value = true;
  try {
    await $fetch(`/api/metrics/${editingMetric.value.id}`, { method: "PATCH", body: input });
    editingMetric.value = null;
    await refreshMetrics();
  } catch (err) {
    toast.add({ title: "Couldn't save defaults", description: apiErrorMessage(err), color: "error" });
  } finally {
    savingDefaults.value = false;
  }
}
</script>

<template>
  <div>
    <header class="border-b border-default pb-4">
      <h1 class="text-xl font-semibold text-highlighted">Monitoring</h1>
      <p class="mt-1 text-muted">What Monli measures, and the templates that apply it to resources.</p>
    </header>

    <UTabs v-model="tab" :items="tabs" :content="false" variant="link" class="mt-4" />

    <!-- Metrics -->
    <div v-if="tab === 'metrics'" class="mt-6">
      <UAlert v-if="metricsError" color="error" variant="subtle" title="Couldn't load metrics" />
      <p v-else-if="!metrics" class="text-muted">Loading metrics…</p>
      <div v-else-if="metrics.length === 0" class="rounded-(--ui-radius) border border-default bg-muted px-4 py-6 text-muted">
        No metrics in the catalog yet.
      </div>
      <div v-else class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
        <table class="w-full text-left">
          <thead class="border-b border-default text-muted">
            <tr>
              <th scope="col" class="py-2 pl-4 pr-4 font-medium">Metric</th>
              <th scope="col" class="px-4 py-2 font-medium">Unit</th>
              <th scope="col" class="px-4 py-2 font-medium">Description</th>
              <th scope="col" class="px-4 py-2 font-medium">Default levels</th>
              <th scope="col" class="px-4 py-2"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metric in metrics" :key="metric.id" class="border-b border-default last:border-b-0">
              <td class="py-2.5 pl-4 pr-4 font-mono text-highlighted">{{ metric.metricKey }}</td>
              <td class="px-4 py-2.5 text-toned">{{ metric.unit ?? "—" }}</td>
              <td class="px-4 py-2.5">{{ metric.description ?? "—" }}</td>
              <td class="px-4 py-2.5">
                <LevelRules
                  v-if="metric.defaultCondition"
                  :condition="metric.defaultCondition"
                  :warning-threshold="metric.defaultWarningThreshold"
                  :critical-threshold="metric.defaultCriticalThreshold"
                  :unit="metric.unit"
                />
                <span v-else>—</span>
              </td>
              <td class="px-4 py-2.5 text-right">
                <ActionButton label="Edit" color="neutral" variant="outline" size="sm" @click="editingMetric = metric" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UModal v-model:open="editOpen" title="Edit metric defaults" :ui="{ content: 'sm:max-w-2xl' }">
        <template #body>
          <MetricDefaultsForm
            v-if="editingMetric"
            :key="editingMetric.id"
            :metric="editingMetric"
            :saving="savingDefaults"
            @submit="saveDefaults"
            @cancel="editingMetric = null"
          />
        </template>
      </UModal>
    </div>

    <!-- Templates -->
    <div v-else class="mt-6 space-y-4">
      <ActionButton v-if="!creating" label="New template" @click="creating = true" />

      <form
        v-else
        class="space-y-3 rounded-(--ui-radius) border border-default bg-muted px-4 py-4"
        @submit.prevent="createTemplate"
      >
        <h2 class="text-base font-semibold text-highlighted">New template</h2>
        <UFormField label="Name" required>
          <UInput v-model="newName" placeholder="Linux host" class="w-full max-w-sm" autofocus />
        </UFormField>
        <UFormField label="Description">
          <UInput v-model="newDescription" class="w-full max-w-lg" />
        </UFormField>
        <div class="flex gap-2">
          <UButton type="submit" label="Create template" :loading="saving" :disabled="!newName.trim()" />
          <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelCreate" />
        </div>
      </form>

      <UAlert v-if="templatesError" color="error" variant="subtle" title="Couldn't load templates" />
      <p v-else-if="!templates" class="text-muted">Loading templates…</p>
      <div v-else-if="templates.length === 0" class="rounded-(--ui-radius) border border-default bg-muted px-4 py-6 text-muted">
        No templates yet. Create one to group metrics and apply them to resources.
      </div>
      <ul v-else class="divide-y divide-default rounded-(--ui-radius) border border-default bg-muted">
        <li v-for="template in templates" :key="template.id">
          <NuxtLink
            :to="`/monitoring/templates/${template.id}`"
            class="block px-4 py-2.5 text-highlighted hover:bg-accented focus-visible:outline-2 focus-visible:outline-(--color-steel)"
          >
            {{ template.name }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
