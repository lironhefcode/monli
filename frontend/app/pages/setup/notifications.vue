<script setup lang="ts">
import { webhookKinds, type DeliveryResult, type WebhookInput, type WebhookRow } from "~/types/webhooks";

const { isAdmin } = useAuth();
const toast = useToast();

const webhooks = ref<WebhookRow[] | null>(null);
const loadError = ref<string | null>(null);

async function load() {
  try {
    webhooks.value = await $fetch<WebhookRow[]>("/api/webhooks");
    loadError.value = null;
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  }
}

onMounted(() => {
  if (isAdmin.value) void load();
});

const kindLabel = (row: WebhookRow) => webhookKinds.find((kind) => kind.value === row.kind)?.label ?? row.kind;

function filtersLabel(row: WebhookRow) {
  const parts = [row.team ? `Team ${row.team}` : "Every team"];
  if (row.minPriority) parts.push(row.minPriority === "p1" ? "P1 only" : `${row.minPriority.toUpperCase()}+`);
  return parts.join(" · ");
}

// Create and edit share one modal; editing is null while adding.
const formOpen = ref(false);
const editing = ref<WebhookRow | null>(null);
const saving = ref(false);
const formError = ref<string | null>(null);

function openForm(row: WebhookRow | null) {
  editing.value = row;
  formError.value = null;
  formOpen.value = true;
}

async function save(input: WebhookInput) {
  saving.value = true;
  formError.value = null;
  try {
    const row = editing.value;
    await $fetch(row ? `/api/webhooks/${row.id}` : "/api/webhooks", { method: row ? "PATCH" : "POST", body: input });
    formOpen.value = false;
    toast.add({ title: row ? `Saved ${input.name}` : `Added ${input.name}`, color: "success" });
    await load();
  } catch (err) {
    formError.value = apiErrorMessage(err);
  } finally {
    saving.value = false;
  }
}

// Enabled: applied as soon as it's switched; reverted if the API refuses.
async function setEnabled(row: WebhookRow, enabled: boolean) {
  row.enabled = enabled;
  try {
    await $fetch(`/api/webhooks/${row.id}`, { method: "PATCH", body: { enabled } });
  } catch (err) {
    row.enabled = !enabled;
    toast.add({ title: "Couldn't change the webhook", description: apiErrorMessage(err), color: "error" });
  }
}

const testingId = ref<number | null>(null);

async function sendTest(row: WebhookRow) {
  testingId.value = row.id;
  try {
    const result = await $fetch<DeliveryResult>(`/api/webhooks/${row.id}/test`, { method: "POST" });
    if (result.error) {
      toast.add({ title: `Test to ${row.name} failed`, description: result.error, color: "error" });
    } else {
      toast.add({ title: `Test sent to ${row.name}`, description: `Answered HTTP ${result.status}.`, color: "success" });
    }
    await load();
  } catch (err) {
    toast.add({ title: "Couldn't send the test", description: apiErrorMessage(err), color: "error" });
  } finally {
    testingId.value = null;
  }
}

const removing = ref<WebhookRow | null>(null);
const removeBusy = ref(false);

async function removeWebhook() {
  const row = removing.value;
  if (!row) return;
  removeBusy.value = true;
  try {
    await $fetch(`/api/webhooks/${row.id}`, { method: "DELETE" });
    toast.add({ title: `Removed ${row.name}`, color: "success" });
    removing.value = null;
    await load();
  } catch (err) {
    toast.add({ title: "Couldn't remove the webhook", description: apiErrorMessage(err), color: "error" });
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
        <p class="mt-1 text-muted">Post to Discord, Slack or any webhook when an alert opens, escalates to critical or resolves.</p>
      </div>
      <ActionButton requires="admin" label="Add webhook" @click="openForm(null)" />
    </header>

    <div class="mt-6 space-y-4">
      <UAlert v-if="!isAdmin" color="neutral" variant="subtle" title="Only admins can manage notifications." />
      <UAlert v-else-if="loadError" color="error" variant="subtle" title="Couldn't load webhooks" :description="loadError" />
      <p v-else-if="!webhooks" class="text-muted">Loading webhooks…</p>
      <p v-else-if="webhooks.length === 0" class="text-muted">No webhooks yet. Add one to get alerts in your chat.</p>

      <div v-else class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
        <table class="w-full text-left">
          <thead class="border-b border-default text-muted">
            <tr>
              <th scope="col" class="py-2 pl-4 pr-4 font-medium">Name</th>
              <th scope="col" class="px-4 py-2 font-medium">Service</th>
              <th scope="col" class="px-4 py-2 font-medium">Sends</th>
              <th scope="col" class="px-4 py-2 font-medium">Last delivery</th>
              <th scope="col" class="px-4 py-2 font-medium">Enabled</th>
              <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in webhooks" :key="row.id" class="border-b border-default last:border-b-0">
              <td class="py-2.5 pl-4 pr-4 text-highlighted">{{ row.name }}</td>
              <td class="px-4 py-2.5">{{ kindLabel(row) }}</td>
              <td class="px-4 py-2.5">{{ filtersLabel(row) }}</td>
              <td class="px-4 py-2.5">
                <span v-if="!row.lastDeliveredAt" class="text-muted">Never</span>
                <span v-else-if="row.lastError" class="text-error" :title="row.lastError">
                  Failed {{ formatAgo(row.lastDeliveredAt) }}
                </span>
                <span v-else>OK {{ formatAgo(row.lastDeliveredAt) }}</span>
              </td>
              <td class="px-4 py-2.5">
                <USwitch
                  :model-value="row.enabled"
                  :aria-label="`Send to ${row.name}`"
                  @update:model-value="(enabled) => setEnabled(row, enabled)"
                />
              </td>
              <td class="px-4 py-2.5">
                <div class="flex justify-end gap-2">
                  <UButton
                    label="Send test"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    :loading="testingId === row.id"
                    @click="sendTest(row)"
                  />
                  <UButton label="Edit" size="xs" color="neutral" variant="outline" @click="openForm(row)" />
                  <UButton label="Remove" size="xs" color="error" variant="outline" @click="removing = row" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? `Edit ${editing.name}` : 'Add webhook'">
      <template #body>
        <WebhookForm :key="editing?.id ?? 'new'" :webhook="editing" :saving="saving" :error="formError" @submit="save" @cancel="formOpen = false" />
      </template>
    </UModal>

    <UModal :open="removing !== null" title="Remove webhook" @update:open="(open) => !open && (removing = null)">
      <template #body>
        <p class="text-toned">
          Remove <span class="text-highlighted">{{ removing?.name }}</span>? Alerts stop being sent to it.
        </p>
        <div class="flex gap-2 pt-6">
          <UButton label="Remove webhook" color="error" :loading="removeBusy" @click="removeWebhook" />
          <UButton label="Cancel" color="neutral" variant="ghost" @click="removing = null" />
        </div>
      </template>
    </UModal>
  </div>
</template>
