<script setup lang="ts">
const emit = defineEmits<{ done: []; cancel: [] }>();

const form = reactive({ current: "", next: "", confirm: "" });
const saving = ref(false);
const error = ref<string | null>(null);

const problem = computed(() => {
  if (form.next && form.next.length < 8) return "Use at least 8 characters.";
  if (form.confirm && form.next !== form.confirm) return "The new passwords don't match.";
  return null;
});

async function submit() {
  saving.value = true;
  error.value = null;
  // Other browsers signed in as this user are signed out.
  const { error: changeError } = await authClient.changePassword({
    currentPassword: form.current,
    newPassword: form.next,
    revokeOtherSessions: true,
  });
  saving.value = false;
  if (changeError) {
    error.value = changeError.status === 400 || changeError.status === 401 ? "The current password is wrong." : (changeError.message ?? "Couldn't change the password.");
    return;
  }
  emit("done");
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <UFormField label="Current password">
      <UInput v-model="form.current" type="password" autocomplete="current-password" required autofocus class="w-full" />
    </UFormField>
    <UFormField label="New password" help="At least 8 characters.">
      <UInput v-model="form.next" type="password" autocomplete="new-password" required class="w-full" />
    </UFormField>
    <UFormField label="Confirm new password" :error="problem ?? undefined">
      <UInput v-model="form.confirm" type="password" autocomplete="new-password" required class="w-full" />
    </UFormField>

    <div class="flex gap-2 pt-2">
      <UButton type="submit" label="Change password" :loading="saving" :disabled="!form.current || !form.next || form.next !== form.confirm || problem !== null" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
