<script setup lang="ts">
// Slack's "Create New App → From a manifest" takes this as-is: an app whose
// only permission is posting to the channel picked when it's installed.
// Slack grants the incoming-webhook scope itself when the feature is enabled;
// listing it under oauth_config is rejected.
const manifest = JSON.stringify(
  {
    display_information: {
      name: "Monli",
      description: "Alert notifications from Monli monitoring",
      background_color: "#1f2937",
    },
    settings: {
      incoming_webhooks: { incoming_webhooks_enabled: true },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  },
  null,
  2
);

const toast = useToast();
const copied = ref(false);

async function copy() {
  // navigator.clipboard only exists in secure contexts (HTTPS or localhost).
  if (!navigator.clipboard) {
    toast.add({ title: "Clipboard unavailable", description: "Select the manifest and copy it manually.", color: "warning" });
    return;
  }
  await navigator.clipboard.writeText(manifest);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <section aria-labelledby="slack-setup-title" class="rounded-(--ui-radius) border border-default bg-default">
    <h3 id="slack-setup-title" class="px-4 py-2 text-toned">Get the URL: add the Monli app to Slack</h3>
    <ol class="list-decimal space-y-1 border-t border-default py-3 pr-4 pl-9 text-highlighted">
      <li>
        Open
        <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noopener" class="text-primary underline">
          api.slack.com/apps
        </a>
        and choose <strong>From a manifest</strong>, then your workspace.
      </li>
      <li>Paste the manifest below on the <strong>JSON</strong> tab and create the app.</li>
      <li><strong>Install to Workspace</strong> and pick the channel alerts should go to.</li>
      <li>
        Under <strong>Incoming Webhooks</strong>, click <strong>Add New Webhook</strong>, then copy the webhook URL into
        the field above.
      </li>
    </ol>
    <div class="flex items-center justify-between gap-3 border-t border-default px-4 py-2">
      <span class="text-muted">App manifest</span>
      <UButton
        :label="copied ? 'Copied' : 'Copy'"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="copy"
      />
    </div>
    <pre class="max-h-48 overflow-auto border-t border-default px-4 py-3 font-mono text-sm text-highlighted select-all">{{ manifest }}</pre>
  </section>
</template>
