<script setup lang="ts">
import type { Alert } from "~/types/alerts";

const POLL_INTERVAL_MS = 15_000;

const { data, error, refresh } = useFetch<Alert[]>("/api/alerts", {
  query: { status: "open" },
});

// Last successful result, so a failed poll doesn't blank the table.
const alerts = ref<Alert[] | null>(null);
const updatedAt = ref<Date | null>(null);
watch(
  data,
  (value) => {
    if (value) {
      alerts.value = value;
      updatedAt.value = new Date();
    }
  },
  { immediate: true }
);

const updatedAtLabel = computed(() =>
  updatedAt.value?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
);

const toast = useToast();
const resolvingId = ref<number | null>(null);

// Manual resolve; the next breaching reading opens a new alert.
async function resolveAlert(alert: Alert) {
  resolvingId.value = alert.id;
  try {
    await $fetch(`/api/alerts/${alert.id}/resolve`, { method: "POST" });
    await refresh();
    toast.add({ title: "Alert resolved", description: alert.subject, color: "success" });
  } catch (err) {
    toast.add({ title: "Couldn't resolve alert", description: apiErrorMessage(err), color: "error" });
  } finally {
    resolvingId.value = null;
  }
}

// Ticks the relative "opened" times along with each poll.
const now = ref(Date.now());

usePolling(() => {
  now.value = Date.now();
  refresh();
}, POLL_INTERVAL_MS);
</script>

<template>
  <div>
    <header class="border-b border-default pb-4">
      <h1 class="text-xl font-semibold text-highlighted">Alerts</h1>
      <p class="mt-1 text-muted">Open alerts across all hosts, newest first.</p>
    </header>

    <div class="mt-6 space-y-4">
      <UAlert
        v-if="error && alerts"
        color="warning"
        variant="subtle"
        :title="`Couldn't refresh. Showing data from ${updatedAtLabel}.`"
      />
      <UAlert
        v-else-if="error"
        color="error"
        variant="subtle"
        title="Couldn't load alerts"
        description="Check that the API is running, then reload the page."
      />

      <p v-if="!alerts && !error" class="text-muted">Loading alerts…</p>

      <div v-else-if="alerts && alerts.length === 0" class="rounded-(--ui-radius) border border-default bg-muted px-4 py-6 text-muted">
        No open alerts.
      </div>

      <div v-else-if="alerts" class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
        <table class="w-full text-left">
          <thead class="border-b border-default text-muted">
            <tr>
              <th scope="col" class="py-2 pl-3 pr-4 font-medium">Severity</th>
              <th scope="col" class="px-4 py-2 font-medium">Priority</th>
              <th scope="col" class="px-4 py-2 font-medium">Host</th>
              <th scope="col" class="px-4 py-2 font-medium">Team</th>
              <th scope="col" class="px-4 py-2 font-medium">Metric</th>
              <th scope="col" class="px-4 py-2 font-medium">Value</th>
              <th scope="col" class="px-4 py-2 font-medium">Message</th>
              <th scope="col" class="px-4 py-2 font-medium">Opened</th>
              <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <AlertRow
              v-for="alert in alerts"
              :key="alert.id"
              :alert="alert"
              :now="now"
              :resolving="resolvingId === alert.id"
              @resolve="resolveAlert"
            />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
