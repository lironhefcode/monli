<script setup lang="ts">
import type { TargetDetail, TargetMetric, TemplateSummary } from "~/types/targets";

const route = useRoute();
const targetId = computed(() => Number(route.params.id));

const { data: target, error, refresh } = useFetch<TargetDetail>(() => `/api/targets/${targetId.value}`);
const { data: allTemplates } = useFetch<TemplateSummary[]>("/api/templates");

const notFound = computed(() => error.value?.statusCode === 404);

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

function apiError(err: unknown, fallback: string) {
  // The backend's error handler responds with { error: string }.
  return (err as { data?: { error?: string } }).data?.error ?? fallback;
}

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
    toast.add({ title: "Couldn't add template", description: apiError(err, "Could not reach the server"), color: "error" });
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
    toast.add({ title: "Couldn't remove template", description: apiError(err, "Could not reach the server"), color: "error" });
  } finally {
    busy.value = false;
  }
}

const conditionSymbols: Record<TargetMetric["condition"], string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
};

function formatRule(metric: TargetMetric) {
  const unit = metric.metric.unit ? ` ${metric.metric.unit}` : "";
  return `${conditionSymbols[metric.condition]} ${metric.threshold}${unit}`;
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
        <h1 class="font-mono text-xl font-semibold text-highlighted">{{ target.name }}</h1>
        <TargetStatus :status="target.status" :last-seen-at="target.lastSeenAt" />
      </header>

      <div class="mt-6 space-y-6">
        <section aria-labelledby="details-title" class="rounded-(--ui-radius) border border-default bg-muted">
          <h2 id="details-title" class="border-b border-default px-4 py-3 text-base font-semibold text-highlighted">Details</h2>
          <dl class="grid gap-x-8 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <th scope="col" class="px-4 py-2 font-medium">Severity</th>
                  <th scope="col" class="px-4 py-2 font-medium">Priority</th>
                  <th scope="col" class="px-4 py-2 font-medium">Interval</th>
                  <th scope="col" class="px-4 py-2 font-medium">From</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="metric in target.metrics" :key="metric.metric.id" class="border-b border-default last:border-b-0">
                  <td class="py-2.5 pl-4 pr-4 font-mono text-highlighted">{{ metric.metric.metricKey }}</td>
                  <td class="px-4 py-2.5 font-mono tabular-nums">
                    {{ formatRule(metric) }}
                    <span v-if="metric.consecutiveBreaches > 1" class="font-sans text-muted">
                      for {{ metric.consecutiveBreaches }} readings
                    </span>
                  </td>
                  <td class="px-4 py-2.5" :class="metric.severity === 'critical' ? 'text-error' : 'text-warning'">
                    {{ metric.severity === "critical" ? "Critical" : "Warning" }}
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
    </template>
  </div>
</template>
