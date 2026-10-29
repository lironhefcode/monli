<script setup lang="ts">
import type { TargetStatus, TargetSummary } from "~/types/targets";
import { displayName, filterTargets } from "~/utils/targets";

const POLL_INTERVAL_MS = 15_000;

const {
  data: targets,
  error,
  refresh,
} = useFetch<TargetSummary[]>("/api/targets");

usePolling(refresh, POLL_INTERVAL_MS);

const statusItems: { label: string; value: TargetStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "Up", value: "up" },
  { label: "Down", value: "down" },
  { label: "Unknown", value: "unknown" },
];

// Search and status live in the URL, so reloads and shared links keep them.
const search = useQueryString("q");
const statusParam = useQueryString("status");
// Unrecognised values in the URL read as "all".
const status = computed({
  get: () => statusItems.find((item) => item.value === statusParam.value)?.value ?? "all",
  set: (value: TargetStatus | "all") => {
    statusParam.value = value === "all" ? "" : value;
  },
});

const shownTargets = computed(() =>
  targets.value ? filterTargets(targets.value, search.value, status.value === "all" ? null : status.value) : []
);

function clearFilters() {
  search.value = "";
  status.value = "all";
}
</script>

<template>
  <div>
    <header class="border-b border-default pb-4">
      <h1 class="text-xl font-semibold text-highlighted">Resources</h1>
      <p class="mt-1 text-muted">Hosts and services Monli monitors.</p>
    </header>

    <div class="mt-6 space-y-4">
      <UAlert
        v-if="error && !targets"
        color="error"
        variant="subtle"
        title="Couldn't load resources"
        description="Check that the API is running, then reload the page."
      />

      <p v-else-if="!targets" class="text-muted">Loading resources…</p>

      <div
        v-else-if="targets.length === 0"
        class="rounded-(--ui-radius) border border-default bg-muted px-4 py-6 text-muted"
      >
        No resources yet.
        <NuxtLink to="/setup" class="text-primary hover:underline"
          >Add an agent</NuxtLink
        >
        to start monitoring a host.
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            type="search"
            icon="i-lucide-search"
            placeholder="Search name, IP, OS or team"
            aria-label="Search resources"
            class="w-full max-w-sm"
          />
          <USelect
            v-model="status"
            :items="statusItems"
            aria-label="Filter by status"
            class="w-40"
          />
          <span class="text-muted" aria-live="polite">
            {{ shownTargets.length }} of {{ targets.length }}
          </span>
        </div>

        <div
          v-if="shownTargets.length === 0"
          class="rounded-(--ui-radius) border border-default bg-muted px-4 py-6 text-muted"
        >
          No resources match these filters.
          <button type="button" class="text-primary hover:underline" @click="clearFilters">
            Clear filters
          </button>
        </div>

        <div
          v-else
          class="overflow-x-auto rounded-(--ui-radius) border border-default bg-muted"
        >
          <table class="w-full text-left">
            <thead class="border-b border-default text-muted">
              <tr>
                <th scope="col" class="py-2 pl-4 pr-4 font-medium">Name</th>
                <th scope="col" class="px-4 py-2 font-medium">IP address</th>
                <th scope="col" class="px-4 py-2 font-medium">OS</th>
                <th scope="col" class="px-4 py-2 font-medium">Status</th>
                <th scope="col" class="px-4 py-2 font-medium">Team</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="target in shownTargets"
                :key="target.id"
                class="cursor-pointer border-b border-default last:border-b-0 hover:bg-accented"
                @click="navigateTo(`/resources/${target.id}`)"
              >
                <td class="py-2.5 pl-4 pr-4">
                  <!-- The link carries keyboard and screen-reader navigation; the row click is a mouse shortcut. -->
                  <NuxtLink
                    :to="`/resources/${target.id}`"
                    class="font-mono text-highlighted hover:underline"
                    @click.stop
                  >
                    {{ displayName(target) }}
                  </NuxtLink>
                </td>
                <td class="px-4 py-2.5 font-mono">
                  {{ target.ipAddress ?? "—" }}
                </td>
                <td class="px-4 py-2.5 text-toned">
                  {{ target.distro ?? target.os ?? "—" }}
                </td>
                <td class="px-4 py-2.5">
                  <TargetStatus
                    :status="target.status"
                    :last-seen-at="target.lastSeenAt"
                  />
                </td>
                <td class="px-4 py-2.5 text-toned">
                  {{ target.responsibleTeam ?? "—" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
