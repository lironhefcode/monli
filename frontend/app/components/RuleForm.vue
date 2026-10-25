<script setup lang="ts">
import type { Priority } from "~/types/monitoring";
import {
  destinationWhere,
  kindInfo,
  type DestinationRow,
  type RuleInput,
  type RuleRow,
  type UserOption,
} from "~/types/notifications";

// Adds or edits a rule and emits the saved row. A destination that doesn't
// exist yet can be added without leaving the form; it's then selected here.
const props = defineProps<{
  rule?: RuleRow | null;
  // Pre-selected when adding a rule from a destination's row.
  destinationId?: number | null;
  destinations: DestinationRow[];
  teams: string[];
  users: UserOption[];
  emailConfigured: boolean;
}>();
const emit = defineEmits<{ saved: [row: RuleRow]; "destination-saved": [row: DestinationRow]; cancel: [] }>();

// Select items can't hold null, so "any" stands for no priority filter.
const ANY = "any";

const editing = props.rule ?? null;
const form = reactive({
  name: editing?.name ?? "",
  teams: [...(editing?.teams ?? [])],
  minPriority: (editing?.minPriority ?? ANY) as Priority | typeof ANY,
  enabled: editing?.enabled ?? true,
  destinationIds: editing ? [...editing.destinationIds] : props.destinationId ? [props.destinationId] : [],
});

// Known teams plus any typed in this form.
const teamItems = ref([...new Set([...props.teams, ...form.teams])]);
function addTeam(team: string) {
  const name = team.trim();
  if (!name) return;
  if (!teamItems.value.includes(name)) teamItems.value.push(name);
  if (!form.teams.includes(name)) form.teams.push(name);
}

const priorityItems = [
  { label: "Any priority", value: ANY },
  { label: "P1 only", value: "p1" },
  { label: "P2 and higher", value: "p2" },
  { label: "P3 and higher", value: "p3" },
  { label: "P4 and higher", value: "p4" },
];

const destinationItems = computed(() =>
  props.destinations.map((destination) => ({
    label: destination.name,
    description: `${kindInfo(destination.kind).label} · ${destinationWhere(destination)}`,
    icon: kindInfo(destination.kind).icon,
    value: destination.id,
  }))
);

// With nothing saved yet, adding a destination is the first step.
const newDestinationOpen = ref(props.destinations.length === 0);

function destinationSaved(row: DestinationRow) {
  emit("destination-saved", row);
  form.destinationIds.push(row.id);
  newDestinationOpen.value = false;
}

const valid = computed(() => form.name.trim() !== "" && form.destinationIds.length > 0);
const saving = ref(false);
const error = ref<string | null>(null);

async function submit() {
  saving.value = true;
  error.value = null;
  const body: RuleInput = {
    name: form.name.trim(),
    teams: form.teams,
    min_priority: form.minPriority === ANY ? null : form.minPriority,
    enabled: form.enabled,
    destination_ids: form.destinationIds,
  };
  try {
    const row = await $fetch<RuleRow>(editing ? `/api/notifications/rules/${editing.id}` : "/api/notifications/rules", {
      method: editing ? "PATCH" : "POST",
      body,
    });
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
    <UFormField label="Name">
      <UInput v-model="form.name" maxlength="100" placeholder="Database team, P2+" required autofocus class="w-full" />
    </UFormField>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField label="Teams" help="Empty: every team. Type a name to add one.">
        <USelectMenu
          v-model="form.teams"
          :items="teamItems"
          multiple
          create-item
          placeholder="Every team"
          class="w-full"
          @create="addTeam"
        />
      </UFormField>
      <UFormField label="Priority">
        <USelect v-model="form.minPriority" :items="priorityItems" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Send to" help="Saved webhooks and email recipients. One channel can serve any number of rules.">
      <USelectMenu
        v-model="form.destinationIds"
        :items="destinationItems"
        value-key="value"
        multiple
        placeholder="Choose where alerts go"
        class="w-full"
      >
        <template #content-bottom>
          <div class="border-t border-default p-1">
            <UButton
              label="New webhook or email…"
              icon="i-lucide-plus"
              color="neutral"
              variant="ghost"
              size="sm"
              block
              class="justify-start"
              @click="newDestinationOpen = true"
            />
          </div>
        </template>
      </USelectMenu>
    </UFormField>

    <USwitch v-model="form.enabled" label="Enabled" description="Sends when an alert opens, escalates to critical or resolves." />

    <div class="flex gap-2 pt-2">
      <UButton type="submit" :label="editing ? 'Save' : 'Add rule'" :loading="saving" :disabled="!valid" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>

    <UModal v-model:open="newDestinationOpen" title="New webhook or email">
      <template #body>
        <DestinationForm
          :users="users"
          :email-configured="emailConfigured"
          @saved="destinationSaved"
          @cancel="newDestinationOpen = false"
        />
      </template>
    </UModal>
  </form>
</template>
