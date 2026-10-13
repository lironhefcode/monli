<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const links: NavigationMenuItem[] = [
  { label: "Alerts", icon: "i-lucide-bell", to: "/alerts" },
  { label: "Resources", icon: "i-lucide-server", to: "/resources" },
  { label: "Setup", icon: "i-lucide-download", to: "/setup" },
];
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-default">
      <UContainer class="flex h-14 items-center gap-6">
        <NuxtLink to="/" class="font-semibold">Monli</NuxtLink>
        <UNavigationMenu :items="links" />
      </UContainer>
    </header>

    <UContainer class="py-6">
      <slot />
    </UContainer>
  </div>
</template>
