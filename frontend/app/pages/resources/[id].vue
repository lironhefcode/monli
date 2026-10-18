<script setup lang="ts">
import type { HistoryRange, TargetDetail, TargetHistory, TargetUpdateInput, TemplateSummary } from "~/types/targets";

const route = useRoute();
const router = useRouter();
const targetId = computed(() => Number(route.params.id));

const { data: target, error, refresh } = useFetch<TargetDetail>(() => `/api/targets/${targetId.value}`);
const { data: allTemplates } = useFetch<TemplateSummary[]>("/api/templates");

const notFound = computed(() => error.value?.statusCode === 404);

// The selected tab and range live in the URL, so reloads and shared links keep them.
const tabs = [
  { label: "Details", value: "details" },
  { label: "Templates & metrics", value: "config" },
  { label: "Graphs", value: "graphs" },
];
const tab = computed({
  get: () => tabs.find((item) => item.value === route.query.tab)?.value ?? "details",
  set: (value: string) => router.replace({ query: { ...route.query, tab: value } }),
});

const ranges: { label: string; value: HistoryRange }[] = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
];
const range = computed<HistoryRange>({
  get: () => ranges.find((item) => item.value === route.query.range)?.value ?? "1h",
  set: (value) => router.replace({ query: { ...route.query, range: value } }),
});

// History is only fetched while the Graphs tab is open.
const { data: history, execute: fetchHistory } = useFetch<TargetHistory>(
  () => `/api/targets/${targetId.value}/history`,
  { query: { range }, immediate: false, watch: false }
);
function loadHistory() {
  if (tab.value === "graphs") fetchHistory();
}
watch([tab, range, targetId], loadHistory, { immediate: true });
// Agents report about once a minute, so polling faster adds nothing.
usePolling(loadHistory, 60_000);

const pointsByMetric = computed(
  () => new Map(history.value?.metrics.map((metric) => [metric.metricId, metric.points]))
);

const toast = useToast();

// Only offer templates that aren't assigned yet (the API answers 409 otherwise).
const templateOptions = computed(() => {
  const assigned = new Set(target.value?.templates.map((template) => template.id));
  return (allTemplates.value ?? [])
    .filter((template) => !assigned.has(template.id))
    .map((template) => ({ label: template.name, value: template.id }));
});

const selectedTemplateId = ref<number | undefined>();
const busy = ref(false);

async function addTemplate() {
  if (selectedTemplateId.value === undefined) return;
  busy.value = true;
  try {
    await $fetch(`/api/targets/${targetId.value}/templates`, {
      method: "POST",
      body: { template_id: selectedTemplateId.value },
    });
    selectedTemplateId.value = undefined;
    await refresh();
  } catch (err) {
    toast.add({ title: "Couldn't add template", description: apiErrorMessage(err), color: "error" });
  } finally {
    busy.value = false;
  }
}

async function removeTemplate(templateId: number) {
  busy.value = true;
  try {
    await $fetch(`/api/targets/${targetId.value}/templates/${templateId}`, { method: "DELETE" });
    await refresh();
  } catch (err) {
    toast.add({ title: "Couldn't remove template", description: apiErrorMessage(err), color: "error" });
  } finally {
    busy.value = false;
  }
}

const editOpen = ref(false);
const saving = ref(false);

async function saveDetails(input: TargetUpdateInput) {
  saving.value = true;
  try {
    await $fetch(`/api/targets/${targetId.value}`, { method: "PATCH", body: input });
    editOpen.value = false;
    await refresh();
  } catch (err) {
    toast.add({ title: "Couldn't save changes", description: apiErrorMessage(err), color: "error" });
  } finally {
    saving.value = false;
  }
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
</script>

<template>
  <div class="max-w-5xl">
    <NuxtLink to="/resources" class="text-muted hover:text-highlighted">Resources</NuxtLink>

    <div v-if="notFound" class="mt-4 rounded-(--ui-radius) border border-default bg-muted px-4 py-6">
      <p class="text-highlighted">Resource not found.</p>
      <NuxtLink to="/resources" class="text-primary hover:underline">Back to resources</NuxtLink>
    </div>

    <UAlert
      v-else-if="error"
      class="mt-4"
      color="error"
      variant="subtle"
      title="Couldn't load this resource"
      description="Check that the API is running, then reload the page."
    />

    <p v-else-if="!target" class="mt-4 text-muted">Loading…</p>

    <template v-else>
      <header class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-default pb-4">
        <h1 class="font-mono text-xl font-semibold text-highlighted">{{ displayName(target) }}</h1>
        <TargetStatus :status="target.status" :last-seen-at="target.lastSeenAt" />
      </header>

      <UModal v-model:open="editOpen" title="Edit resource">
        <template #body>
          <TargetEditForm :target="target" :saving="saving" @submit="saveDetails" @cancel="editOpen = false" />
        </template>
      </UModal>

      <UTabs v-model="tab" :items="tabs" :content="false" variant="link" class="mt-4" />

      <div v-if="tab === 'details'" class="mt-6">
        <section aria-labelledby="details-title" class="rounded-(--ui-radius) border border-default bg-muted">
          <div class="flex items-center justify-between border-b border-default px-4 py-2">
            <h2 id="details-title" class="text-base font-semibold text-highlighted">Details</h2>
            <UButton label="Edit" color="neutral" variant="outline" size="sm" @click="editOpen = true" />
          </div>
          <dl class="grid gap-x-8 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt class="text-muted">Hostname</dt>
              <dd class="font-mono text-highlighted">{{ target.name }}</dd>
            </div>
            <div>
              <dt class="text-muted">Alias</dt>
              <dd class="text-highlighted">{{ target.alias ?? "—" }}</dd>
            </div>
            <div>
              <dt class="text-muted">IP address</dt>
              <dd class="font-mono text-highlighted">{{ target.ipAddress ?? "—" }}</dd>
            </div>
            <div>
              <dt class="text-muted">Type</dt>
              <dd class="text-highlighted">{{ target.type }}</dd>
            </div>
            <div>
              <dt class="text-muted">Team</dt>
              <dd class="text-highlighted">{{ target.responsibleTeam ?? "—" }}</dd>
            </div>
            <div>
              <dt class="text-muted">Operating system</dt>
              <dd class="text-highlighted">{{ [target.os, target.arch].filter(Boolean).join(", ") || "—" }}</dd>
            </div>
            <div>
              <dt class="text-muted">Last seen</dt>
              <dd class="text-highlighted">{{ formatDate(target.lastSeenAt) }}</dd>
            </div>
            <div>
              <dt class="text-muted">Added</dt>
              <dd class="text-highlighted">{{ formatDate(target.createdAt) }}</dd>
            </div>
            <div v-if="target.description" class="sm:col-span-2 lg:col-span-3">
              <dt class="text-muted">Description</dt>
              <dd class="text-highlighted">{{ target.description }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div v-else-if="tab === 'config'" class="mt-6 space-y-6">
        <section aria-labelledby="templates-title" class="rounded-(--ui-radius) border border-default bg-muted">
          <header class="border-b border-default px-4 py-3">
            <h2 id="templates-title" class="text-base font-semibold text-highlighted">Templates</h2>
            <p class="text-muted">Metrics are monitored from every template assigned here.</p>
          </header>

          <ul v-if="target.templates.length" class="divide-y divide-default">
            <li v-for="template in target.templates" :key="template.id" class="flex items-center justify-between gap-3 px-4 py-2">
              <span class="text-highlighted">{{ template.name }}</span>
              <UButton
                label="Remove"
                size="xs"
                color="neutral"
                variant="outline"
                :disabled="busy"
                @click="removeTemplate(template.id)"
              />
            </li>
          </ul>
          <p v-else class="px-4 py-3 text-muted">No templates assigned, so nothing is monitored yet.</p>

          <div class="flex flex-wrap items-center gap-2 border-t border-default px-4 py-3">
            <USelect
              v-model="selectedTemplateId"
              :items="templateOptions"
              placeholder="Choose a template"
              aria-label="Template to add"
              class="w-64"
              :disabled="templateOptions.length === 0"
            />
            <UButton label="Add template" :loading="busy" :disabled="selectedTemplateId === undefined" @click="addTemplate" />
            <span v-if="allTemplates && templateOptions.length === 0" class="text-dimmed">All templates are assigned.</span>
          </div>
        </section>

        <section aria-labelledby="metrics-title" class="rounded-(--ui-radius) border border-default bg-muted">
          <header class="border-b border-default px-4 py-3">
            <h2 id="metrics-title" class="text-base font-semibold text-highlighted">Assigned metrics</h2>
            <p class="text-muted">The thresholds alerting uses for this resource.</p>
          </header>

          <p v-if="target.metrics.length === 0" class="px-4 py-3 text-muted">Assign a template to monitor metrics.</p>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="border-b border-default text-muted">
                <tr>
                  <th scope="col" class="py-2 pl-4 pr-4 font-medium">Metric</th>
                  <th scope="col" class="px-4 py-2 font-medium">Alert when</th>
                  <th scope="col" class="px-4 py-2 font-medium">Priority</th>
                  <th scope="col" class="px-4 py-2 font-medium">Interval</th>
                  <th scope="col" class="px-4 py-2 font-medium">From</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="metric in target.metrics" :key="metric.metric.id" class="border-b border-default last:border-b-0">
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
                  <td class="px-4 py-2.5 text-toned">
                    {{ metric.source.name }}
                    <span v-if="metric.overridden" class="text-muted">(overridden)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div v-else class="mt-6">
        <section aria-labelledby="graphs-title" class="rounded-(--ui-radius) border border-default bg-muted">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3">
            <div>
              <h2 id="graphs-title" class="text-base font-semibold text-highlighted">Graphs</h2>
              <p class="text-muted">Average per interval; the shaded band reaches each interval's peak.</p>
            </div>
            <UTabs v-model="range" :items="ranges" :content="false" size="xs" aria-label="Time range" />
          </header>

          <p v-if="target.metrics.length === 0" class="px-4 py-3 text-muted">Assign a template to see graphs.</p>
          <p v-else-if="!history" class="px-4 py-3 text-muted">Loading…</p>

          <div v-else class="grid gap-px bg-(--ui-border) lg:grid-cols-2">
            <figure v-for="metric in target.metrics" :key="metric.metric.id" class="bg-muted px-4 py-3 lg:last:odd:col-span-2">
              <figcaption class="mb-2 font-mono text-highlighted">{{ metric.metric.metricKey }}</figcaption>
              <MetricChart
                v-if="pointsByMetric.get(metric.metric.id)?.length"
                :points="pointsByMetric.get(metric.metric.id)!"
                :from="history.from"
                :to="history.to"
                :bucket-sec="history.bucketSec"
                :unit="metric.metric.unit"
                :warning-threshold="metric.warningThreshold"
                :critical-threshold="metric.criticalThreshold"
              />
              <p v-else class="flex h-[180px] items-center justify-center text-muted">No readings in this range.</p>
            </figure>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
