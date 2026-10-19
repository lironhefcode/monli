<script setup lang="ts">
import { userRoles, type NewUserInput } from "~/types/users";

defineProps<{ saving?: boolean; error?: string | null }>();
const emit = defineEmits<{ submit: [input: NewUserInput]; cancel: [] }>();

const form = reactive<NewUserInput>({ name: "", email: "", password: "", role: "viewer" });
const roleItems = userRoles.map((role) => ({ label: `${role.label} — ${role.description}`, value: role.value }));
const valid = computed(() => form.name.trim() !== "" && form.email.trim() !== "" && form.password.length >= 8);

function submit() {
  emit("submit", { ...form, name: form.name.trim(), email: form.email.trim() });
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <UFormField label="Name">
      <UInput v-model="form.name" maxlength="100" required autofocus class="w-full" />
    </UFormField>
    <UFormField label="Email" help="Used to sign in.">
      <UInput v-model="form.email" type="email" required class="w-full" />
    </UFormField>
    <UFormField label="Password" help="At least 8 characters. Share it with the user; they can change it after signing in.">
      <UInput v-model="form.password" type="password" autocomplete="new-password" required class="w-full" />
    </UFormField>
    <UFormField label="Role">
      <USelect v-model="form.role" :items="roleItems" class="w-full" />
    </UFormField>

    <div class="flex gap-2 pt-2">
      <UButton type="submit" label="Create user" :loading="saving" :disabled="!valid" />
      <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('cancel')" />
    </div>
  </form>
</template>
