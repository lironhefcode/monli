<script setup lang="ts">
import type { Alert, AlertAction } from "~/types/alerts";

// One form for Ack, Unack and Resolve; the note is optional for each.
const props = defineProps<{ alert: Alert; action: AlertAction; saving?: boolean }>();

const emit = defineEmits<{
  submit: [note: string | null];
  cancel: [];
}>();

const note = ref("");

const copy: Record<AlertAction, { label: string; hint: string }> = {
  ack: {
    label: "Acknowledge",
    hint: "The alert moves to the Acknowledged tab until it resolves or is unacknowledged.",
  },
  unack: { label: "Unacknowledge", hint: "The alert moves back to the Open tab." },
  resolve: { label: "Resolve", hint: "If the metric is still breaching, the next reading opens a new alert." },
};
const submitLabel = computed(() => copy[props.action].label);
const hint = computed(() => copy[props.action].hint);

function submit() {
  emit("submit", note.value.trim() || null);
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <p class="text-highlighted">
      <span class="font-mono">{{ alert.hostName }}</span> · {{ alert.subject }}
    </p>

    <UFormField label="Note" help="Optional.">
      <UTextarea v-model="note" :rows="3" maxlength="500" autofocus class="w-full" />
    </UFormField>

    <p class="text-muted">{{ hint }}</p>

    <div class="flex gap-2 pt-2">
      <UButton type="submit" :label="submitLabel" :loading="saving" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
