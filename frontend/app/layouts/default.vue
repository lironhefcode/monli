<script setup lang="ts">
const links = [
  { label: "Alerts", to: "/alerts" },
  { label: "Resources", to: "/resources" },
  { label: "Monitoring", to: "/monitoring" },
  { label: "Setup", to: "/setup" },
];
</script>

<template>
  <div class="min-h-screen lg:flex">
    <aside class="border-b border-default bg-muted lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div class="flex items-center gap-6 px-4 lg:block lg:px-0">
        <NuxtLink to="/" class="block py-3 text-lg font-semibold text-highlighted lg:px-5 lg:py-5">Monli</NuxtLink>

        <nav aria-label="Main">
          <ul class="flex gap-1 lg:flex-col lg:gap-0">
            <li v-for="link in links" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="nav-link block border-b-[3px] border-transparent px-3 py-3 text-muted hover:text-highlighted lg:border-b-0 lg:border-l-[3px] lg:px-5 lg:py-2"
              >
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
    </aside>

    <main class="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
      <slot />
    </main>
  </div>
</template>

<style scoped>
/* The status rail: active section is marked by a steel left edge (bottom edge on mobile). */
.nav-link.router-link-active {
  border-color: var(--color-steel);
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-accented);
}

.nav-link:focus-visible {
  outline: 2px solid var(--color-steel);
  outline-offset: -2px;
}
</style>
