<script setup lang="ts">
import {
  destinationKinds,
  kindInfo,
  type DestinationInput,
  type DestinationKind,
  type DestinationRow,
  type DestinationUpdate,
  type UserOption,
} from "~/types/notifications";

// Adds or edits a destination and emits the saved row, so a rule being
// written can pick a destination created on the spot.
const props = defineProps<{ destination?: DestinationRow | null; users: UserOption[]; emailConfigured: boolean }>();
const emit = defineEmits<{ saved: [row: DestinationRow]; cancel: [] }>();

const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

const editing = props.destination ?? null;
const form = reactive({
  name: editing?.name ?? "",
  kind: (editing?.kind ?? "discord") as DestinationKind,
  url: "",
  emailAddresses: [...(editing?.emailAddresses ?? [])],
  userIds: [...(editing?.userIds ?? [])],
});
// Editing a webhook keeps its saved URL (never sent to the browser) until Replace.
const replacingUrl = ref(!editing || (editing.kind !== "email" && editing.urlHost === null));

const isEmail = computed(() => form.kind === "email");
const kindItems = destinationKinds.map(({ label, value, icon }) => ({ label, value, icon }));
const invalidAddresses = computed(() => form.emailAddresses.filter((address) => !EMAIL_PATTERN.test(address)));
const valid = computed(() => {
  if (form.name.trim() === "") return false;
  if (isEmail.value) return invalidAddresses.value.length === 0 && form.emailAddresses.length + form.userIds.length > 0;
  return !replacingUrl.value || /^https?:\/\/\S+$/.test(form.url.trim());
});

const saving = ref(false);
const error = ref<string | null>(null);

function body(): DestinationInput | DestinationUpdate {
  const name = form.name.trim();
  if (isEmail.value) {
    return { name, ...(editing ? {} : { kind: "email" }), email_addresses: form.emailAddresses, user_ids: form.userIds };
  }
  const url = replacingUrl.value ? { url: form.url.trim() } : {};
  return editing ? { name, ...url } : { name, kind: form.kind as Exclude<DestinationKind, "email">, url: form.url.trim() };
}

async function submit() {
  saving.value = true;
  error.value = null;
  try {
    const row = await $fetch<DestinationRow>(
      editing ? `/api/notifications/destinations/${editing.id}` : "/api/notifications/destinations",
      { method: editing ? "PATCH" : "POST", body: body() }
    );
    emit("saved", row);
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <UFormField label="Name" help="How rules list it, e.g. the channel name.">
      <UInput v-model="form.name" maxlength="100" placeholder="#ops-alerts" required autofocus class="w-full" />
    </UFormField>
    <UFormField label="Service" :help="editing ? 'Fixed once saved.' : undefined">
      <USelect v-model="form.kind" :items="kindItems" :disabled="editing !== null" class="w-full" />
    </UFormField>

    <template v-if="isEmail">
      <UAlert
        v-if="!emailConfigured"
        color="warning"
        variant="subtle"
        title="Set up the email server first, under Email server on this page."
      />
      <UFormField label="Users">
        <USelectMenu v-model="form.userIds" :items="users" value-key="value" multiple placeholder="Choose users" class="w-full" />
      </UFormField>
      <UFormField
        label="Other addresses"
        :help="kindInfo('email').help"
        :error="invalidAddresses.length ? `Not an email address: ${invalidAddresses.join(', ')}` : undefined"
      >
        <UInputTags
          v-model="form.emailAddresses"
          :max="20"
          add-on-blur
          add-on-paste
          delimiter=","
          placeholder="oncall@example.com"
          class="w-full"
        />
      </UFormField>
    </template>

    <template v-else>
      <UFormField v-if="replacingUrl" label="Webhook URL" :help="kindInfo(form.kind).help">
        <UInput v-model="form.url" type="url" autocomplete="off" required class="w-full font-mono" />
      </UFormField>
      <UFormField v-else label="Webhook URL">
        <div class="flex items-center justify-between gap-3 rounded-(--ui-radius) border border-default px-3 py-2">
          <span class="text-toned">
            Saved URL for <span class="font-mono text-highlighted">{{ editing?.urlHost }}</span>
          </span>
          <UButton label="Replace" size="xs" color="neutral" variant="outline" @click="replacingUrl = true" />
        </div>
      </UFormField>
      <SlackSetupGuide v-if="form.kind === 'slack' && replacingUrl" />
    </template>

    <div class="flex gap-2 pt-2">
      <UButton type="submit" :label="editing ? 'Save' : 'Save destination'" :loading="saving" :disabled="!valid" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
