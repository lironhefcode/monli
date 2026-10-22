<script setup lang="ts">
import { userRoles, type NewUserInput, type UserRole, type UserRow } from "~/types/users";

const { user: me, isAdmin } = useAuth();
const toast = useToast();

const users = ref<UserRow[] | null>(null);
const loadError = ref<string | null>(null);

async function load() {
  const { data, error } = await authClient.admin.listUsers({ query: { sortBy: "name", sortDirection: "asc", limit: 500 } });
  if (error) {
    loadError.value = error.message ?? "Couldn't load users.";
    return;
  }
  loadError.value = null;
  users.value = data.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: (u.role ?? "viewer") as UserRole,
  }));
}

onMounted(() => {
  if (isAdmin.value) void load();
});

const roleItems = userRoles.map((role) => ({ label: role.label, value: role.value }));

// Create
const createOpen = ref(false);
const creating = ref(false);
const createError = ref<string | null>(null);

function openCreate() {
  createError.value = null;
  createOpen.value = true;
}

async function createUser(input: NewUserInput) {
  creating.value = true;
  createError.value = null;
  const { error } = await authClient.admin.createUser(input);
  creating.value = false;
  if (error) {
    createError.value = error.message ?? "Couldn't create the user.";
    return;
  }
  createOpen.value = false;
  toast.add({ title: `Created ${input.email}`, color: "success" });
  await load();
}

// Role: applied as soon as it's picked; reverted if the API refuses.
async function setRole(row: UserRow, role: UserRole) {
  const previous = row.role;
  row.role = role;
  const { error } = await authClient.admin.setRole({ userId: row.id, role });
  if (error) {
    row.role = previous;
    toast.add({ title: "Couldn't change the role", description: error.message, color: "error" });
    return;
  }
  toast.add({ title: `${row.name} is now ${role}`, color: "success" });
}

// Reset password
const resetting = ref<UserRow | null>(null);
const newPassword = ref("");
const savingPassword = ref(false);

function openReset(row: UserRow) {
  newPassword.value = "";
  resetting.value = row;
}

async function resetPassword() {
  const row = resetting.value;
  if (!row) return;
  savingPassword.value = true;
  const { error } = await authClient.admin.setUserPassword({ userId: row.id, newPassword: newPassword.value });
  savingPassword.value = false;
  if (error) {
    toast.add({ title: "Couldn't set the password", description: error.message, color: "error" });
    return;
  }
  toast.add({ title: `Password set for ${row.email}`, color: "success" });
  resetting.value = null;
}

// Remove
const removing = ref<UserRow | null>(null);
const removeBusy = ref(false);

async function removeUser() {
  const row = removing.value;
  if (!row) return;
  removeBusy.value = true;
  const { error } = await authClient.admin.removeUser({ userId: row.id });
  removeBusy.value = false;
  if (error) {
    toast.add({ title: "Couldn't remove the user", description: error.message, color: "error" });
    return;
  }
  toast.add({ title: `Removed ${row.email}`, color: "success" });
  removing.value = null;
  await load();
}
</script>

<template>
  <div>
    <header class="flex flex-wrap items-end justify-between gap-4 border-b border-default pb-4">
      <div>
        <NuxtLink to="/setup" class="text-muted hover:text-highlighted">Setup</NuxtLink>
        <h1 class="text-xl font-semibold text-highlighted">Users</h1>
        <p class="mt-1 text-muted">Viewers see every page, editors can also take actions, admins can also manage users.</p>
      </div>
      <ActionButton requires="admin" label="Add user" @click="openCreate" />
    </header>

    <div class="mt-6 space-y-4">
      <UAlert v-if="!isAdmin" color="neutral" variant="subtle" title="Only admins can manage users." />
      <UAlert v-else-if="loadError" color="error" variant="subtle" title="Couldn't load users" :description="loadError" />
      <p v-else-if="!users" class="text-muted">Loading users…</p>

      <div v-else class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted">
        <table class="w-full text-left">
          <thead class="border-b border-default text-muted">
            <tr>
              <th scope="col" class="py-2 pl-4 pr-4 font-medium">Name</th>
              <th scope="col" class="px-4 py-2 font-medium">Email</th>
              <th scope="col" class="px-4 py-2 font-medium">Role</th>
              <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in users" :key="row.id" class="border-b border-default last:border-b-0">
              <td class="py-2.5 pl-4 pr-4 text-highlighted">
                {{ row.name }}
                <span v-if="row.id === me?.id" class="ml-1 text-xs text-muted">(you)</span>
              </td>
              <td class="px-4 py-2.5 font-mono">{{ row.email }}</td>
              <td class="px-4 py-2.5">
                <!-- Your own role is locked, so there's always an admin left. -->
                <USelect
                  :model-value="row.role"
                  :items="roleItems"
                  :disabled="row.id === me?.id"
                  :aria-label="`Role for ${row.name}`"
                  size="sm"
                  class="w-32"
                  @update:model-value="(role) => setRole(row, role as UserRole)"
                />
              </td>
              <td class="px-4 py-2.5">
                <div class="flex justify-end gap-2">
                  <UButton label="Reset password" size="xs" color="neutral" variant="outline" @click="openReset(row)" />
                  <UButton label="Remove" size="xs" color="error" variant="outline" :disabled="row.id === me?.id" @click="removing = row" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="createOpen" title="Add user">
      <template #body>
        <UserForm :saving="creating" :error="createError" @submit="createUser" @cancel="createOpen = false" />
      </template>
    </UModal>

    <UModal :open="resetting !== null" :title="`Reset password: ${resetting?.email ?? ''}`" @update:open="(open) => !open && (resetting = null)">
      <template #body>
        <form class="space-y-4" @submit.prevent="resetPassword">
          <UFormField label="New password" help="At least 8 characters. Share it with the user.">
            <UInput v-model="newPassword" type="password" autocomplete="new-password" required autofocus class="w-full" />
          </UFormField>
          <div class="flex gap-2 pt-2">
            <UButton type="submit" label="Set password" :loading="savingPassword" :disabled="newPassword.length < 8" />
            <UButton label="Cancel" color="neutral" variant="ghost" @click="resetting = null" />
          </div>
        </form>
      </template>
    </UModal>

    <UModal :open="removing !== null" title="Remove user" @update:open="(open) => !open && (removing = null)">
      <template #body>
        <p class="text-toned">
          Remove <span class="font-mono text-highlighted">{{ removing?.email }}</span>? They're signed out and can't sign in
          again. Alert comments they wrote keep their name.
        </p>
        <div class="flex gap-2 pt-6">
          <UButton label="Remove user" color="error" :loading="removeBusy" @click="removeUser" />
          <UButton label="Cancel" color="neutral" variant="ghost" @click="removing = null" />
        </div>
      </template>
    </UModal>
  </div>
</template>
