<script setup lang="ts">
import type { Alert, AlertAction, AlertComment } from "~/types/alerts";

// Ack, unack and resolve history for one alert, fetched when shown.
const props = defineProps<{ alert: Alert }>();

const { data: comments, error } = useFetch<AlertComment[]>(() => `/api/alerts/${props.alert.id}/comments`);

const actionLabels: Record<AlertAction, string> = {
  ack: "Acknowledged",
  unack: "Unacknowledged",
  resolve: "Resolved",
};
</script>

<template>
  <div class="space-y-4">
    <p class="text-highlighted">
      <span class="font-mono">{{ alert.hostName }}</span> · {{ alert.subject }}
    </p>

    <UAlert v-if="error" color="error" variant="subtle" title="Couldn't load comments" />
    <p v-else-if="!comments" class="text-muted">Loading comments…</p>
    <p v-else-if="comments.length === 0" class="text-muted">No comments yet.</p>

    <ol v-else class="divide-y divide-default rounded-(--ui-radius) border border-default">
      <li v-for="comment in comments" :key="comment.id" class="px-3 py-2">
        <div class="flex items-baseline justify-between gap-4">
          <span class="font-medium text-highlighted">{{ actionLabels[comment.action] }}</span>
          <time :datetime="comment.createdAt" class="text-muted">{{ new Date(comment.createdAt).toLocaleString() }}</time>
        </div>
        <p v-if="comment.body" class="mt-1 whitespace-pre-line text-toned">{{ comment.body }}</p>
      </li>
    </ol>
  </div>
</template>
