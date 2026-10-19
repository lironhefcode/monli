<script setup lang="ts">
const links = [
  { label: "Alerts", to: "/alerts" },
  { label: "Resources", to: "/resources" },
  { label: "Monitoring", to: "/monitoring" },
  { label: "Setup", to: "/setup" },
];

// Section-level match, so /resources/8 still marks Resources as current.
const route = useRoute();
function isCurrent(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`);
}

const { user, signOut } = useAuth();
const toast = useToast();
const passwordOpen = ref(false);

function passwordChanged() {
  passwordOpen.value = false;
  toast.add({ title: "Password changed", color: "success" });
}
</script>

<template>
  <div class="min-h-screen lg:flex">
    <aside class="flex flex-col border-b border-default bg-muted lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div class="flex items-center gap-6 px-4 lg:block lg:px-0">
        <NuxtLink to="/" class="block py-3 text-lg font-semibold text-highlighted lg:px-5 lg:py-5">Monli</NuxtLink>

        <nav aria-label="Main">
          <ul class="flex gap-1 lg:flex-col lg:gap-0">
            <li v-for="link in links" :key="link.to">
              <NuxtLink
                :to="link.to"
                :aria-current="isCurrent(link.to) ? 'page' : undefined"
                class="nav-link block border-b-[3px] border-transparent px-3 py-3 text-muted hover:text-highlighted lg:border-b-0 lg:border-l-[3px] lg:px-5 lg:py-2"
              >
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>
      </div>

      <div v-if="user" class="flex items-center justify-between gap-3 border-t border-default px-4 py-3 lg:mt-auto lg:block lg:px-5 lg:py-4">
        <div class="min-w-0">
          <p class="truncate text-highlighted" :title="user.email">{{ user.name }}</p>
          <p class="truncate text-xs text-muted">{{ user.email }} · <span class="capitalize">{{ user.role }}</span></p>
        </div>
        <div class="flex gap-1 lg:-ml-2 lg:mt-2">
          <UButton label="Change password" size="xs" color="neutral" variant="ghost" @click="passwordOpen = true" />
          <UButton label="Sign out" size="xs" color="neutral" variant="ghost" @click="signOut" />
        </div>
      </div>
    </aside>

    <UModal v-model:open="passwordOpen" title="Change password">
      <template #body>
        <ChangePasswordForm @done="passwordChanged" @cancel="passwordOpen = false" />
      </template>
    </UModal>

    <main class="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
      <slot />
    </main>
  </div>
</template>

<style scoped>
/* The status rail: active section is marked by a steel left edge (bottom edge on mobile). */
.nav-link[aria-current="page"] {
  border-color: var(--color-steel);
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-accented);
}

.nav-link:focus-visible {
  outline: 2px solid var(--color-steel);
  outline-offset: -2px;
}
</style>
