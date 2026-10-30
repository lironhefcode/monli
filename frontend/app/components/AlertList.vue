<script setup lang="ts">
import type { Ref } from "vue";
import type { Alert, AlertAction, AlertPage, AlertTab } from "~/types/alerts";

// Alerts across all hosts, or one resource's when targetId is set.
const props = defineProps<{ targetId?: number }>();

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;

// Tab, filters, search and page live in the URL, so reloads and shared links keep them.
const tabParam = useQueryString("status");
const search = useQueryString("q");
// Any of several; empty lists every team or priority.
const teams = useQueryList("team");
const priorityParam = useQueryList("priority");
const severityParam = useQueryString("severity");
const fromParam = useQueryString("from");
const toParam = useQueryString("to");
const pageParam = useQueryString("page");

const tabNames: Record<AlertTab, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};
// Unrecognised values in the URL read as the Open tab.
const tab = computed<AlertTab>({
  get: () => (tabParam.value in tabNames ? (tabParam.value as AlertTab) : "open"),
  set: (value) => {
    tabParam.value = value === "open" ? "" : value;
  },
});
// Acked alerts have their own tab, even if they escalate afterwards.
const tabQuery: Record<AlertTab, { status: string; acknowledged?: string }> = {
  open: { status: "open", acknowledged: "false" },
  acknowledged: { status: "open", acknowledged: "true" },
  resolved: { status: "resolved" },
};

// A select bound to a URL value; "all" (no value in the URL) when it isn't one of the options.
function selectFilter(param: Ref<string>, values: () => string[]) {
  return computed({
    get: () => (values().includes(param.value) ? param.value : "all"),
    set: (value: string) => {
      param.value = value === "all" ? "" : value;
    },
  });
}

const PRIORITIES = ["p1", "p2", "p3", "p4"];
const priorityItems = PRIORITIES.map((value) => ({ label: value.toUpperCase(), value }));
// Unrecognised values in the URL are ignored rather than sent (the API would 400).
const priorities = computed({
  get: () => priorityParam.value.filter((value) => PRIORITIES.includes(value)),
  set: (values: string[]) => {
    priorityParam.value = values;
  },
});

const severityItems = [
  { label: "All severities", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "Warning", value: "warning" },
];
const severity = selectFilter(severityParam, () => severityItems.map((item) => item.value));

// The team filter isn't offered on one resource's alerts.
const { data: teamNames } = useFetch<string[]>("/api/alerts/teams", { immediate: !props.targetId });
// Teams in the URL stay selectable even before (or if not) in the loaded list.
const teamItems = computed(() => [...new Set([...(teamNames.value ?? []), ...teams.value])]);

// <input type="date"> values; anything else in the URL is ignored.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const from = computed(() => (DATE_PATTERN.test(fromParam.value) ? fromParam.value : ""));
const to = computed(() => (DATE_PATTERN.test(toParam.value) ? toParam.value : ""));

const page = computed({
  get: () => Math.max(1, Number.parseInt(pageParam.value, 10) || 1),
  set: (value: number) => {
    pageParam.value = value > 1 ? String(value) : "";
  },
});

// The search is sent once typing pauses, not on every key.
const sentSearch = ref(search.value.trim());
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    sentSearch.value = value.trim();
  }, SEARCH_DELAY_MS);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

// A different tab or filter starts again from the first page.
watch([tab, sentSearch, teams, priorities, severity, from, to], () => {
  page.value = 1;
});

const query = computed(() => ({
  ...tabQuery[tab.value],
  targetId: props.targetId,
  // Arrays go out as repeated keys (?team=a&team=b).
  team: props.targetId || !teams.value.length ? undefined : teams.value,
  priority: priorities.value.length ? priorities.value : undefined,
  severity: severity.value === "all" ? undefined : severity.value,
  // Whole local days: from the start of `from` to the end of `to`.
  from: from.value ? new Date(`${from.value}T00:00:00`).toISOString() : undefined,
  to: to.value ? new Date(`${to.value}T23:59:59.999`).toISOString() : undefined,
  q: sentSearch.value || undefined,
  limit: PAGE_SIZE,
  offset: (page.value - 1) * PAGE_SIZE,
}));

const { data, error, refresh } = useFetch<AlertPage>("/api/alerts", { query });

// Last successful result, so a failed poll doesn't blank the table.
const alertPage = ref<AlertPage | null>(null);
const updatedAt = ref<Date | null>(null);
watch(
  data,
  (value) => {
    if (value) {
      alertPage.value = value;
      updatedAt.value = new Date();
    }
  },
  { immediate: true },
);
const shownAlerts = computed(() => alertPage.value?.alerts ?? null);

const pageCount = computed(() => Math.max(1, Math.ceil((alertPage.value?.total ?? 0) / PAGE_SIZE)));
// Alerts resolving or a filter narrowing can leave the page past the end.
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});
const rangeLabel = computed(() => {
  const total = alertPage.value?.total ?? 0;
  const first = (page.value - 1) * PAGE_SIZE + 1;
  return `${first}–${Math.min(total, page.value * PAGE_SIZE)} of ${total}`;
});

const tabs = computed(() =>
  (Object.keys(tabNames) as AlertTab[]).map((value) => ({
    label: `${tabNames[value]} (${alertPage.value?.counts[value] ?? 0})`,
    value,
  })),
);

const filtered = computed(
  () =>
    Boolean(search.value.trim() || priorities.value.length || severityParam.value || from.value || to.value) ||
    Boolean(!props.targetId && teams.value.length),
);
function clearFilters() {
  search.value = "";
  teams.value = [];
  priorityParam.value = [];
  severityParam.value = "";
  fromParam.value = "";
  toParam.value = "";
}

const updatedAtLabel = computed(() =>
  updatedAt.value?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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

// Ticks the relative times along with each poll.
const now = ref(Date.now());

usePolling(() => {
  now.value = Date.now();
  refresh();
}, POLL_INTERVAL_MS);
</script>

<template>
  <div>
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

    <UTabs v-model="tab" :items="tabs" :content="false" variant="link" />

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        placeholder="Search host, team, metric or message"
        aria-label="Search alerts"
        class="w-full max-w-sm"
      />
      <USelect
        v-if="!targetId"
        v-model="teams"
        :items="teamItems"
        multiple
        placeholder="All teams"
        aria-label="Filter by team"
        class="w-44"
      />
      <USelect
        v-model="priorities"
        :items="priorityItems"
        multiple
        placeholder="All priorities"
        aria-label="Filter by priority"
        class="w-40"
      />
      <USelect v-model="severity" :items="severityItems" aria-label="Filter by severity" class="w-36" />
      <span class="inline-flex items-center gap-1">
        <UInput v-model="fromParam" type="date" aria-label="Opened from" :max="to || undefined" class="w-40" />
        <span class="text-muted">to</span>
        <UInput v-model="toParam" type="date" aria-label="Opened to" :min="from || undefined" class="w-40" />
      </span>
      <UButton v-if="filtered" label="Clear filters" color="neutral" variant="link" @click="clearFilters" />
    </div>

    <div class="mt-6 space-y-4">
      <UAlert
        v-if="error && alertPage"
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

      <p v-if="!alertPage && !error" class="text-muted">Loading alerts…</p>

      <div
        v-else-if="shownAlerts && shownAlerts.length === 0"
        class="rounded-(--ui-radius) border border-default bg-muted px-4 py-6 text-muted"
      >
        <template v-if="filtered">
          No {{ tabNames[tab].toLowerCase() }} alerts match these filters.
          <button type="button" class="text-primary hover:underline" @click="clearFilters">Clear filters</button>
        </template>
        <template v-else>No {{ tabNames[tab].toLowerCase() }} alerts.</template>
      </div>

      <template v-else-if="shownAlerts">
        <div class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
          <table class="w-full text-left">
            <thead class="border-b border-default text-muted">
              <tr>
                <th scope="col" class="py-2 pl-3 pr-4 font-medium">Severity</th>
                <th scope="col" class="px-4 py-2 font-medium">Priority</th>
                <th v-if="!targetId" scope="col" class="px-4 py-2 font-medium">Host</th>
                <th scope="col" class="px-4 py-2 font-medium">Team</th>
                <th scope="col" class="px-4 py-2 font-medium">Metric</th>
                <th scope="col" class="px-4 py-2 font-medium">Value</th>
                <th scope="col" class="px-4 py-2 font-medium">Message</th>
                <th scope="col" class="px-4 py-2 font-medium">Opened</th>
                <template v-if="tab === 'resolved'">
                  <th scope="col" class="px-4 py-2 font-medium">Resolved</th>
                  <th scope="col" class="px-4 py-2 font-medium">Duration</th>
                </template>
                <th v-else scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <AlertRow
                v-for="alert in shownAlerts"
                :key="alert.id"
                :alert="alert"
                :now="now"
                :hide-host="Boolean(targetId)"
                :checking="isChecking(alert.target.id, alert.metric.id)"
                @action="startAction"
                @check="checkAlert"
                @open="viewing = $event"
              />
            </tbody>
          </table>
        </div>

        <div v-if="pageCount > 1" class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-muted">{{ rangeLabel }}</span>
          <UPagination v-model:page="page" :total="alertPage?.total ?? 0" :items-per-page="PAGE_SIZE" />
        </div>
      </template>
    </div>
  </div>
</template>
