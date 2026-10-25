<script setup lang="ts">
import {
  destinationWhere,
  kindInfo,
  priorityLabel,
  teamsLabel,
  type DeliveryResult,
  type DestinationRow,
  type EmailServer,
  type RuleRow,
  type UserOption,
} from "~/types/notifications";

const { isAdmin } = useAuth();
const toast = useToast();

const rules = ref<RuleRow[] | null>(null);
const destinations = ref<DestinationRow[] | null>(null);
const emailServer = ref<EmailServer | null>(null);
const teams = ref<string[]>([]);
const users = ref<UserOption[]>([]);
const loadError = ref<string | null>(null);

async function loadRules() {
  rules.value = await $fetch<RuleRow[]>("/api/notifications/rules");
}

async function loadDestinations() {
  destinations.value = await $fetch<DestinationRow[]>("/api/notifications/destinations");
}

// Recipient choices for email destinations, every page of them; typed
// addresses still work if this fails.
const USERS_PAGE = 500;

async function loadUsers() {
  const all: UserOption[] = [];
  for (let offset = 0; ; offset += USERS_PAGE) {
    const { data } = await authClient.admin.listUsers({
      query: { sortBy: "name", sortDirection: "asc", limit: USERS_PAGE, offset },
    });
    if (!data) break;
    all.push(...data.users.map((u) => ({ label: u.name, description: u.email, value: u.id })));
    if (data.users.length < USERS_PAGE || all.length >= data.total) break;
  }
  users.value = all;
}

async function load() {
  try {
    await Promise.all([
      loadRules(),
      loadDestinations(),
      $fetch<EmailServer>("/api/notifications/email-server").then((server) => (emailServer.value = server)),
      $fetch<string[]>("/api/notifications/teams").then((names) => (teams.value = names)),
      loadUsers(),
    ]);
    loadError.value = null;
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  }
}

onMounted(() => {
  if (isAdmin.value) void load();
});

const destinationNames = (rule: RuleRow) =>
  rule.destinationIds
    .map((id) => destinations.value?.find((destination) => destination.id === id)?.name)
    .filter(Boolean)
    .join(", ");

// Rule form: one modal for add and edit; destinationId pre-selects a destination.
const ruleForm = ref<{ rule: RuleRow | null; destinationId: number | null } | null>(null);

async function ruleSaved(row: RuleRow, wasEditing: boolean) {
  ruleForm.value = null;
  toast.add({ title: wasEditing ? `Saved ${row.name}` : `Added ${row.name}`, color: "success" });
  await Promise.all([loadRules(), loadDestinations()]);
}

// A destination created from inside the rule form joins the list right away.
function destinationAdded(row: DestinationRow) {
  destinations.value = [...(destinations.value ?? []), row].sort((a, b) => a.name.localeCompare(b.name));
}

// Rule enabled: applied as soon as it's switched; reverted if the API refuses.
async function setEnabled(rule: RuleRow, enabled: boolean) {
  rule.enabled = enabled;
  try {
    await $fetch(`/api/notifications/rules/${rule.id}`, { method: "PATCH", body: { enabled } });
  } catch (err) {
    rule.enabled = !enabled;
    toast.add({ title: "Couldn't change the rule", description: apiErrorMessage(err), color: "error" });
  }
}

// Destination form: undefined while closed, null while adding.
const destinationForm = ref<DestinationRow | null | undefined>(undefined);

async function destinationSaved(row: DestinationRow) {
  const wasEditing = Boolean(destinationForm.value);
  destinationForm.value = undefined;
  toast.add({ title: wasEditing ? `Saved ${row.name}` : `Saved ${row.name}; add a rule to send alerts to it`, color: "success" });
  await loadDestinations();
}

const testingId = ref<number | null>(null);

async function sendTest(row: DestinationRow) {
  testingId.value = row.id;
  try {
    const result = await $fetch<DeliveryResult>(`/api/notifications/destinations/${row.id}/test`, { method: "POST" });
    if (result.error) {
      toast.add({ title: `Test to ${row.name} failed`, description: result.error, color: "error" });
    } else {
      const description = result.status === null ? "Email sent." : `Answered HTTP ${result.status}.`;
      toast.add({ title: `Test sent to ${row.name}`, description, color: "success" });
    }
    await loadDestinations();
  } catch (err) {
    toast.add({ title: "Couldn't send the test", description: apiErrorMessage(err), color: "error" });
  } finally {
    testingId.value = null;
  }
}

// Remove: one confirmation modal for rules and destinations.
const removing = ref<{ kind: "rule"; row: RuleRow } | { kind: "destination"; row: DestinationRow } | null>(null);
const removeBusy = ref(false);

async function confirmRemove() {
  const target = removing.value;
  if (!target) return;
  removeBusy.value = true;
  try {
    const path = target.kind === "rule" ? "rules" : "destinations";
    await $fetch(`/api/notifications/${path}/${target.row.id}`, { method: "DELETE" });
    toast.add({ title: `Removed ${target.row.name}`, color: "success" });
    removing.value = null;
    await Promise.all([loadRules(), loadDestinations()]);
  } catch (err) {
    toast.add({ title: `Couldn't remove ${target.row.name}`, description: apiErrorMessage(err), color: "error" });
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <div>
    <header class="flex flex-wrap items-end justify-between gap-4 border-b border-default pb-4">
      <div>
        <NuxtLink to="/setup" class="text-muted hover:text-highlighted">Setup</NuxtLink>
        <h1 class="text-xl font-semibold text-highlighted">Notifications</h1>
        <p class="mt-1 text-muted">
          Rules send alerts to Discord, Slack, email or any webhook when they open, escalate to critical or resolve.
        </p>
      </div>
      <ActionButton requires="admin" label="Add rule" @click="ruleForm = { rule: null, destinationId: null }" />
    </header>

    <div class="mt-6 space-y-6">
      <UAlert v-if="!isAdmin" color="neutral" variant="subtle" title="Only admins can manage notifications." />
      <UAlert v-else-if="loadError" color="error" variant="subtle" title="Couldn't load notifications" :description="loadError" />
      <p v-else-if="!rules || !destinations" class="text-muted">Loading notifications…</p>

      <template v-else>
        <section aria-labelledby="rules-title" class="space-y-2">
          <h2 id="rules-title" class="text-base font-semibold text-highlighted">Rules</h2>
          <p v-if="rules.length === 0" class="text-muted">No rules yet. Add one to choose which alerts go where.</p>
          <div v-else class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
            <table class="w-full text-left">
              <thead class="border-b border-default text-muted">
                <tr>
                  <th scope="col" class="py-2 pl-4 pr-4 font-medium">Name</th>
                  <th scope="col" class="px-4 py-2 font-medium">Teams</th>
                  <th scope="col" class="px-4 py-2 font-medium">Priority</th>
                  <th scope="col" class="px-4 py-2 font-medium">Sends to</th>
                  <th scope="col" class="px-4 py-2 font-medium">Enabled</th>
                  <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rule in rules" :key="rule.id" class="border-b border-default last:border-b-0">
                  <td class="py-2.5 pl-4 pr-4 text-highlighted">{{ rule.name }}</td>
                  <td class="px-4 py-2.5">{{ teamsLabel(rule.teams) }}</td>
                  <td class="px-4 py-2.5">{{ priorityLabel(rule.minPriority) }}</td>
                  <td class="max-w-72 truncate px-4 py-2.5" :title="destinationNames(rule)">{{ destinationNames(rule) }}</td>
                  <td class="px-4 py-2.5">
                    <USwitch
                      :model-value="rule.enabled"
                      :aria-label="`Rule ${rule.name} enabled`"
                      @update:model-value="(enabled) => setEnabled(rule, enabled)"
                    />
                  </td>
                  <td class="px-4 py-2.5">
                    <div class="flex justify-end gap-2">
                      <UButton label="Edit" size="xs" color="neutral" variant="outline" @click="ruleForm = { rule, destinationId: null }" />
                      <UButton label="Remove" size="xs" color="error" variant="outline" @click="removing = { kind: 'rule', row: rule }" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="destinations-title" class="space-y-2">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="destinations-title" class="text-base font-semibold text-highlighted">Saved webhooks and emails groups</h2>
              <p class="text-muted">Entered once, then picked by any number of rules.</p>
            </div>
            <UButton label="Add destination" size="sm" color="neutral" variant="outline" @click="destinationForm = null" />
          </div>
          <p v-if="destinations.length === 0" class="text-muted">Nothing saved yet.</p>
          <div v-else class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
            <table class="w-full text-left">
              <thead class="border-b border-default text-muted">
                <tr>
                  <th scope="col" class="py-2 pl-4 pr-4 font-medium">Name</th>
                  <th scope="col" class="px-4 py-2 font-medium">Service</th>
                  <th scope="col" class="px-4 py-2 font-medium">Where</th>
                  <th scope="col" class="px-4 py-2 font-medium">Used by</th>
                  <th scope="col" class="px-4 py-2 font-medium">Last delivery</th>
                  <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in destinations" :key="row.id" class="border-b border-default last:border-b-0">
                  <td class="py-2.5 pl-4 pr-4 text-highlighted">{{ row.name }}</td>
                  <td class="px-4 py-2.5">
                    <span class="inline-flex items-center gap-1.5">
                      <UIcon :name="kindInfo(row.kind).icon" class="text-muted" />{{ kindInfo(row.kind).label }}
                    </span>
                  </td>
                  <td
                    class="max-w-64 truncate px-4 py-2.5"
                    :class="{ 'text-error': row.kind !== 'email' && !row.urlHost }"
                    :title="destinationWhere(row)"
                  >
                    {{ destinationWhere(row) }}
                  </td>
                  <td class="px-4 py-2.5" :class="{ 'text-muted': row.ruleCount === 0 }">
                    {{ row.ruleCount === 1 ? "1 rule" : `${row.ruleCount} rules` }}
                  </td>
                  <td class="px-4 py-2.5">
                    <span v-if="!row.lastDeliveredAt" class="text-muted">Never</span>
                    <span v-else-if="row.lastError" class="text-error" :title="row.lastError">
                      Failed {{ formatAgo(row.lastDeliveredAt) }}
                    </span>
                    <span v-else>OK {{ formatAgo(row.lastDeliveredAt) }}</span>
                  </td>
                  <td class="px-4 py-2.5">
                    <div class="flex justify-end gap-2">
                      <UButton
                        label="Add rule"
                        size="xs"
                        color="neutral"
                        variant="outline"
                        @click="ruleForm = { rule: null, destinationId: row.id }"
                      />
                      <UButton
                        label="Send test"
                        size="xs"
                        color="neutral"
                        variant="outline"
                        :loading="testingId === row.id"
                        @click="sendTest(row)"
                      />
                      <UButton label="Edit" size="xs" color="neutral" variant="outline" @click="destinationForm = row" />
                      <UButton
                        label="Remove"
                        size="xs"
                        color="error"
                        variant="outline"
                        @click="removing = { kind: 'destination', row }"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <EmailServerForm v-if="emailServer" :server="emailServer" @change="(server) => (emailServer = server)" />
      </template>
    </div>

    <UModal
      :open="ruleForm !== null"
      :title="ruleForm?.rule ? `Edit ${ruleForm.rule.name}` : 'Add rule'"
      @update:open="(open) => !open && (ruleForm = null)"
    >
      <template #body>
        <RuleForm
          v-if="ruleForm && destinations"
          :key="ruleForm.rule?.id ?? `new-${ruleForm.destinationId}`"
          :rule="ruleForm.rule"
          :destination-id="ruleForm.destinationId"
          :destinations="destinations"
          :teams="teams"
          :users="users"
          :email-configured="emailServer?.configured ?? false"
          @saved="(row) => ruleSaved(row, Boolean(ruleForm?.rule))"
          @destination-saved="destinationAdded"
          @cancel="ruleForm = null"
        />
      </template>
    </UModal>

    <UModal
      :open="destinationForm !== undefined"
      :title="destinationForm ? `Edit ${destinationForm.name}` : 'Add destination'"
      @update:open="(open) => !open && (destinationForm = undefined)"
    >
      <template #body>
        <DestinationForm
          :key="destinationForm?.id ?? 'new'"
          :destination="destinationForm"
          :users="users"
          :email-configured="emailServer?.configured ?? false"
          @saved="destinationSaved"
          @cancel="destinationForm = undefined"
        />
      </template>
    </UModal>

    <UModal :open="removing !== null" :title="removing?.kind === 'rule' ? 'Remove rule' : 'Remove destination'" @update:open="(open) => !open && (removing = null)">
      <template #body>
        <p class="text-toned">
          Remove <span class="text-highlighted">{{ removing?.row.name }}</span>?
          <template v-if="removing?.kind === 'rule'">Its destinations stay saved for other rules.</template>
          <template v-else>Its saved URL or recipients are deleted.</template>
        </p>
        <div class="flex gap-2 pt-6">
          <UButton label="Remove" color="error" :loading="removeBusy" @click="confirmRemove" />
          <UButton label="Cancel" color="neutral" variant="ghost" @click="removing = null" />
        </div>
      </template>
    </UModal>
  </div>
</template>
