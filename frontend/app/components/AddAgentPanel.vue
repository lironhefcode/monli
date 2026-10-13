<script setup lang="ts">
type AgentOs = "linux" | "windows";

// Response of POST /agents/enrollment-tokens.
interface EnrollmentToken {
  token: string;
  expiresAt: string;
  os: AgentOs;
  serverUrl: string;
  installCommand: string;
}

const osOptions: { value: AgentOs; label: string; available: boolean }[] = [
  { value: "linux", label: "Linux", available: true },
  { value: "windows", label: "Windows", available: false },
];

const toast = useToast();

const open = ref(false);
const os = ref<AgentOs>("linux");
const enrollment = ref<EnrollmentToken | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);

const expiresAtLabel = computed(() =>
  enrollment.value
    ? new Date(enrollment.value.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : ""
);

const osGroup = useTemplateRef<HTMLElement>("osGroup");

// Starts the flow and puts keyboard focus on the selected OS, the next step.
async function start() {
  open.value = true;
  await nextTick();
  osGroup.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}

// Hides the command again; a token already minted stays valid until it expires.
function cancel() {
  open.value = false;
  os.value = "linux";
  enrollment.value = null;
  error.value = null;
  copied.value = false;
}

// A command for one OS must not linger after switching to another.
function selectOs(value: AgentOs) {
  if (value === os.value) return;
  os.value = value;
  enrollment.value = null;
  error.value = null;
}

// Each call mints a new single-use token, so this only ever runs on click.
async function generate() {
  loading.value = true;
  error.value = null;
  copied.value = false;
  try {
    enrollment.value = await $fetch<EnrollmentToken>("/api/agents/enrollment-tokens", {
      method: "POST",
      body: { os: os.value },
    });
  } catch (err) {
    // The backend's error handler responds with { error: string }.
    const data = (err as { data?: { error?: string } }).data;
    error.value = data?.error ?? "Could not reach the server";
  } finally {
    loading.value = false;
  }
}

async function copy() {
  if (!enrollment.value) return;
  // navigator.clipboard only exists in secure contexts (HTTPS or localhost).
  if (!navigator.clipboard) {
    toast.add({
      title: "Clipboard unavailable",
      description: "Select the command and copy it manually.",
      color: "warning",
    });
    return;
  }
  await navigator.clipboard.writeText(enrollment.value.installCommand);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <section aria-labelledby="add-agent-title" class="rounded-(--ui-radius) border border-default bg-muted">
    <header class="border-b border-default px-4 py-3">
      <h2 id="add-agent-title" class="text-base font-semibold text-highlighted">Add agent</h2>
      <p class="text-muted">Install the agent on a host to start monitoring it.</p>
    </header>

    <div v-if="!open" class="px-4 py-4">
      <UButton label="Add agent" @click="start" />
    </div>

    <div v-else class="space-y-4 px-4 py-4">
      <fieldset>
        <legend class="mb-2 text-toned">Operating system</legend>
        <div class="flex flex-wrap items-center gap-3">
          <div ref="osGroup" class="inline-flex overflow-hidden rounded-(--ui-radius) border border-default">
            <button
              v-for="option in osOptions"
              :key="option.value"
              type="button"
              :disabled="!option.available"
              :aria-pressed="os === option.value"
              class="os-option border-r border-default px-4 py-1.5 last:border-r-0"
              @click="selectOs(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <span class="text-dimmed">Windows support is coming soon.</span>
        </div>
      </fieldset>

      <div class="flex gap-2">
        <UButton
          :label="enrollment ? 'Generate new command' : 'Generate install command'"
          :loading="loading"
          @click="generate"
        />
        <UButton label="Cancel" color="neutral" variant="ghost" @click="cancel" />
      </div>

      <UAlert v-if="error" color="error" variant="subtle" title="Could not generate a command" :description="error" />

      <div v-if="enrollment" class="rounded-(--ui-radius) border border-default bg-default">
        <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-2">
          <span class="text-muted">Run as root on the target host</span>
          <UButton
            :label="copied ? 'Copied' : 'Copy'"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="copy"
          />
        </div>
        <pre class="overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] px-4 py-3 font-mono text-sm text-highlighted select-all"><span class="text-dimmed select-none">$ </span>{{ enrollment.installCommand }}</pre>
        <p class="border-t border-default px-4 py-2 text-muted">
          Works once and expires at {{ expiresAtLabel }}.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.os-option {
  color: var(--ui-text-muted);
}

.os-option:hover:not(:disabled) {
  color: var(--ui-text-highlighted);
}

.os-option[aria-pressed="true"] {
  background: var(--ui-bg-accented);
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 -2px 0 var(--color-steel);
}

.os-option:disabled {
  color: var(--ui-text-dimmed);
  cursor: not-allowed;
}

.os-option:focus-visible {
  outline: 2px solid var(--color-steel);
  outline-offset: -2px;
}
</style>
