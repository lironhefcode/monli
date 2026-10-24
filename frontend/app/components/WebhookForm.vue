<script setup lang="ts">
import type { Priority } from "~/types/monitoring";
import { webhookKinds, type WebhookInput, type WebhookRow } from "~/types/webhooks";

const props = defineProps<{ webhook?: WebhookRow | null; saving?: boolean; error?: string | null }>();
const emit = defineEmits<{ submit: [input: WebhookInput]; cancel: [] }>();

// Select items can't hold null, so "any" stands for no priority filter.
const ANY = "any";

const form = reactive({
  name: props.webhook?.name ?? "",
  kind: props.webhook?.kind ?? "discord",
  url: props.webhook?.url ?? "",
  enabled: props.webhook?.enabled ?? true,
  team: props.webhook?.team ?? "",
  minPriority: (props.webhook?.minPriority ?? ANY) as Priority | typeof ANY,
});

const kindItems = webhookKinds.map((kind) => ({ label: kind.label, value: kind.value }));
const kindHelp = computed(() => webhookKinds.find((kind) => kind.value === form.kind)?.help);
const priorityItems = [
  { label: "Any priority", value: ANY },
  { label: "P1 only", value: "p1" },
  { label: "P2 and higher", value: "p2" },
  { label: "P3 and higher", value: "p3" },
  { label: "P4 and higher", value: "p4" },
];
const valid = computed(() => form.name.trim() !== "" && /^https?:\/\/\S+$/.test(form.url.trim()));

function submit() {
  emit("submit", {
    name: form.name.trim(),
    kind: form.kind,
    url: form.url.trim(),
    enabled: form.enabled,
    team: form.team.trim() || null,
    min_priority: form.minPriority === ANY ? null : form.minPriority,
  });
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <UFormField label="Name">
      <UInput v-model="form.name" maxlength="100" placeholder="#ops-alerts" required autofocus class="w-full" />
    </UFormField>
    <UFormField label="Service">
      <USelect v-model="form.kind" :items="kindItems" class="w-full" />
    </UFormField>
    <UFormField label="Webhook URL" :help="kindHelp">
      <UInput v-model="form.url" type="url" autocomplete="off" required class="w-full font-mono" />
    </UFormField>
    <SlackSetupGuide v-if="form.kind === 'slack'" />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField label="Team" help="Only this team's alerts. Empty: every team.">
        <UInput v-model="form.team" maxlength="100" class="w-full" />
      </UFormField>
      <UFormField label="Priority">
        <USelect v-model="form.minPriority" :items="priorityItems" class="w-full" />
      </UFormField>
    </div>
    <USwitch v-model="form.enabled" label="Enabled" description="Sends when an alert opens, escalates to critical or resolves." />

    <div class="flex gap-2 pt-2">
      <UButton type="submit" :label="webhook ? 'Save' : 'Add webhook'" :loading="saving" :disabled="!valid" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
