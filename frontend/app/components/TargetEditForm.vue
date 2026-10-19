<script setup lang="ts">
import type { TargetDetail, TargetUpdateInput } from "~/types/targets";

// Fields start from the resource's current values; a blank field clears it.
const props = defineProps<{ target: TargetDetail; saving?: boolean }>();

const emit = defineEmits<{
  submit: [input: TargetUpdateInput];
  cancel: [];
}>();

const form = reactive({
  alias: props.target.alias ?? "",
  responsibleTeam: props.target.responsibleTeam ?? "",
});

function submit() {
  emit("submit", {
    alias: form.alias.trim() || null,
    responsible_team: form.responsibleTeam.trim() || null,
  });
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UFormField label="Alias" help="Shown instead of the hostname. Leave blank to show the hostname.">
      <UInput v-model="form.alias" :placeholder="target.name" maxlength="100" autofocus class="w-full" />
    </UFormField>
    <UFormField label="Responsible team" help="Leave blank for no team.">
      <UInput v-model="form.responsibleTeam" maxlength="100" class="w-full" />
    </UFormField>

    <p class="text-muted">Changes apply to new alerts. Open alerts keep the name and team they opened with.</p>

    <div class="flex gap-2 pt-2">
      <UButton type="submit" label="Save changes" :loading="saving" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
