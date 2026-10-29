<script setup lang="ts">
import type { Alert, AlertAction } from "~/types/alerts";
import { matchesSearch } from "~/utils/search";

const POLL_INTERVAL_MS = 15_000;

const route = useRoute();
const router = useRouter();

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

// Kept in the URL like the tab; the tab counts show matches only.
const search = useQueryString("q");
const matchingAlerts = computed(
  () =>
    alerts.value?.filter((alert) =>
      matchesSearch(search.value, [
        alert.hostName,
        alert.target.name,
        alert.responsibleTeam,
        alert.metric.metricKey,
        alert.interface?.name,
        alert.subject,
        alert.description,
        alert.severity,
        alert.priority,
      ])
    ) ?? null
);

// Acked alerts move to their own tab, even if they escalate afterwards.
const openAlerts = computed(() => matchingAlerts.value?.filter((alert) => !alert.acknowledged) ?? null);
const ackedAlerts = computed(() => matchingAlerts.value?.filter((alert) => alert.acknowledged) ?? null);

// The selected tab lives in the URL, so reloads and shared links keep it.
const tabs = computed(() => [
  { label: `Open (${openAlerts.value?.length ?? 0})`, value: "open" },
  { label: `Acknowledged (${ackedAlerts.value?.length ?? 0})`, value: "acknowledged" },
]);
const tab = computed({
  get: () => (route.query.tab === "acknowledged" ? "acknowledged" : "open"),
  set: (value: string) => router.replace({ query: { ...route.query, tab: value } }),
});
const shownAlerts = computed(() => (tab.value === "acknowledged" ? ackedAlerts.value : openAlerts.value));

const updatedAtLabel = computed(() =>
  updatedAt.value?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
);

const toast = useToast();

const actionText: Record<AlertAction, { title: string; done: string; failed: string }> = {
  ack: { title: "Acknowledge alert", done: "Alert acknowledged", failed: "Couldn't acknowledge alert" },
  unack: { title: "Unacknowledge alert", done: "Alert unacknowledged", failed: "Couldn't unacknowledge alert" },
  resolve: { title: "Resolve alert", done: "Alert resolved", failed: "Couldn't resolve alert" },
};

// Ack, Unack and Resolve open the note form; pending holds the alert and action.
const pending = ref<{ alert: Alert; action: AlertAction } | null>(null);
const saving = ref(false);
const actionOpen = computed({
  get: () => pending.value !== null,
  set: (open: boolean) => {
    if (!open) pending.value = null;
  },
});

function startAction(alert: Alert, action: AlertAction) {
  pending.value = { alert, action };
}

// Alert whose comments modal is open.
const viewing = ref<Alert | null>(null);
const commentsOpen = computed({
  get: () => viewing.value !== null,
  set: (open: boolean) => {
    if (!open) viewing.value = null;
  },
});

// Ack/unack patch the flag; a manual resolve reopens on the next breaching reading.
async function submitAction(note: string | null) {
  if (!pending.value) return;
  const { alert, action } = pending.value;
  saving.value = true;
  try {
    if (action === "resolve") {
      await $fetch(`/api/alerts/${alert.id}/resolve`, { method: "POST", body: { note } });
    } else {
      await $fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        body: { acknowledged: action === "ack", comment: note },
      });
    }
    pending.value = null;
    await refresh();
    toast.add({ title: actionText[action].done, description: alert.subject, color: "success" });
  } catch (err) {
    toast.add({ title: actionText[action].failed, description: apiErrorMessage(err), color: "error" });
  } finally {
    saving.value = false;
  }
}

const { check, isChecking, showResult } = useMetricCheck();

// Asks for a fresh reading now; a healthy one resolves the alert.
function checkAlert(alert: Alert) {
  check(alert.target.id, alert.metric.id, (result) => {
    showResult(alert.metric.metricKey, alert.metric.unit, result);
    refresh();
  });
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

    <UModal v-model:open="commentsOpen" title="Comments">
      <template #body>
        <AlertComments v-if="viewing" :key="viewing.id" :alert="viewing" />
      </template>
    </UModal>

    <UModal v-model:open="actionOpen" :title="pending ? actionText[pending.action].title : ''">
      <template #body>
        <AlertActionForm
          v-if="pending"
          :key="`${pending.action}-${pending.alert.id}`"
          :alert="pending.alert"
          :action="pending.action"
          :saving="saving"
          @submit="submitAction"
          @cancel="pending = null"
        />
      </template>
    </UModal>

    <div class="mt-4 flex flex-wrap items-end justify-between gap-2">
      <UTabs v-model="tab" :items="tabs" :content="false" variant="link" />
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        placeholder="Search host, team, metric or message"
        aria-label="Search alerts"
        class="w-full max-w-sm"
      />
    </div>

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

      <div v-else-if="shownAlerts && shownAlerts.length === 0" class="rounded-(--ui-radius) border border-default bg-muted px-4 py-6 text-muted">
        <template v-if="search.trim()">
          No {{ tab === "acknowledged" ? "acknowledged" : "open" }} alerts match this search.
          <button type="button" class="text-primary hover:underline" @click="search = ''">Clear search</button>
        </template>
        <template v-else>
          {{ tab === "acknowledged" ? "No acknowledged alerts." : "No open alerts." }}
        </template>
      </div>

      <div v-else-if="shownAlerts" class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
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
              v-for="alert in shownAlerts"
              :key="alert.id"
              :alert="alert"
              :now="now"
              :checking="isChecking(alert.target.id, alert.metric.id)"
              @action="startAction"
              @check="checkAlert"
              @open="viewing = $event"
            />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
