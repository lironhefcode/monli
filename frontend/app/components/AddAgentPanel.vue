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
  { value: "windows", label: "Windows", available: true },
];

const WINDOWS_FILENAME = "monli-agent-setup.exe";

const toast = useToast();

const open = ref(false);
const os = ref<AgentOs>("linux");
const enrollment = ref<EnrollmentToken | null>(null);
// Set once the Windows exe has been downloaded; its token is inside the file.
const windowsDownload = ref<{ expiresAt: string } | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);

const expiresAtLabel = computed(() => {
  const expiresAt = enrollment.value?.expiresAt ?? windowsDownload.value?.expiresAt;
  return expiresAt ? new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
});

const osGroup = useTemplateRef<HTMLElement>("osGroup");

// Starts the flow and puts keyboard focus on the selected OS, the next step.
async function start() {
  open.value = true;
  await nextTick();
  osGroup.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}

// Hides the command or download again; a token already minted stays valid
// until it expires.
function cancel() {
  open.value = false;
  os.value = "linux";
  enrollment.value = null;
  windowsDownload.value = null;
  error.value = null;
  copied.value = false;
}

// A command for one OS must not linger after switching to another.
function selectOs(value: AgentOs) {
  if (value === os.value) return;
  os.value = value;
  enrollment.value = null;
  windowsDownload.value = null;
  error.value = null;
}

// The backend's error handler responds with { error: string }. A request for
// a blob gets its error body as a blob too.
async function errorMessage(err: unknown): Promise<string> {
  let data = (err as { data?: unknown }).data;
  if (data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch {
      data = undefined;
    }
  }
  return (data as { error?: string } | undefined)?.error ?? "Could not reach the server";
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
    error.value = await errorMessage(err);
  } finally {
    loading.value = false;
  }
}

// Each call mints a new single-use token baked into the exe, so this only
// ever runs on click. Fetched rather than linked so errors show here instead
// of as a broken download.
async function downloadWindowsAgent() {
  loading.value = true;
  error.value = null;
  try {
    const response = await $fetch.raw<Blob>("/api/agents/download/windows-x86_64", {
      method: "POST",
      responseType: "blob",
    });
    saveFile(response._data!, WINDOWS_FILENAME);
    windowsDownload.value = { expiresAt: response.headers.get("x-enrollment-expires-at") ?? "" };
  } catch (err) {
    error.value = await errorMessage(err);
  } finally {
    loading.value = false;
  }
}

// Hands a fetched file to the browser's downloads.
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Some browsers read the URL only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
      <ActionButton label="Add agent" @click="start" />
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
        </div>
      </fieldset>

      <div class="flex gap-2">
        <UButton
          v-if="os === 'windows'"
          :label="windowsDownload ? 'Download again' : 'Download agent'"
          icon="i-lucide-download"
          :loading="loading"
          @click="downloadWindowsAgent"
        />
        <UButton
          v-else
          :label="enrollment ? 'Generate new command' : 'Generate install command'"
          :loading="loading"
          @click="generate"
        />
        <UButton label="Cancel" color="neutral" variant="ghost" @click="cancel" />
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="os === 'windows' ? 'Could not download the agent' : 'Could not generate a command'"
        :description="error"
      />

      <div v-if="windowsDownload" class="rounded-(--ui-radius) border border-default bg-default">
        <p class="border-b border-default px-4 py-2 text-muted">Downloaded {{ WINDOWS_FILENAME }}</p>
        <ol class="list-decimal space-y-1 py-3 pr-4 pl-9 text-highlighted">
          <li>Copy it to the target host and double-click it.</li>
          <li>Approve the administrator prompt.</li>
          <li>
            If Windows SmartScreen warns about an unrecognized app, choose <strong>More info</strong>, then
            <strong>Run anyway</strong>.
          </li>
        </ol>
        <p class="border-t border-default px-4 py-2 text-muted">
          Works once and expires at {{ expiresAtLabel }}.
        </p>
      </div>

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
