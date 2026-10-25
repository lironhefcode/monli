<script setup lang="ts">
import type { EmailServer, EmailServerInput, SecurityMode } from "~/types/notifications";

const props = defineProps<{ server: EmailServer }>();
const emit = defineEmits<{ change: [server: EmailServer] }>();
const toast = useToast();

const securityItems: { label: string; value: SecurityMode; port: number }[] = [
  { label: "TLS (usually port 465)", value: "tls", port: 465 },
  { label: "STARTTLS (usually port 587)", value: "starttls", port: 587 },
  { label: "None (port 25, local relays only)", value: "none", port: 25 },
];

const initial = props.server.configured ? props.server : null;
const form = reactive({
  host: initial?.host ?? "",
  port: initial?.port ?? 587,
  security: (initial?.security ?? "starttls") as SecurityMode,
  username: initial?.username ?? "",
  password: "",
  from: initial?.fromAddress ?? "",
});
// The saved password is never sent to the browser; it's kept unless replaced.
const changingPassword = ref(!initial?.hasPassword);

// The server keeps the saved password only for the same host, port, security
// and username, so changing any of them asks for it again.
const accountChanged = computed(() => {
  const saved = props.server.configured ? props.server : null;
  return (
    saved !== null &&
    (form.host.trim() !== saved.host ||
      form.port !== saved.port ||
      form.security !== saved.security ||
      (form.username.trim() || null) !== saved.username)
  );
});
const needsPassword = computed(() => changingPassword.value || accountChanged.value);

// Picking a security mode moves the port along while it's still a default one.
watch(
  () => form.security,
  (security, previous) => {
    const defaultPort = (mode: SecurityMode) => securityItems.find((item) => item.value === mode)!.port;
    if (form.port === defaultPort(previous)) form.port = defaultPort(security);
  }
);

const valid = computed(
  () =>
    form.host.trim() !== "" &&
    Number.isInteger(form.port) &&
    form.port > 0 &&
    form.from.includes("@") &&
    (!needsPassword.value || form.username.trim() === "" || form.password !== "")
);

const saving = ref(false);
const removing = ref(false);
const error = ref<string | null>(null);

async function save() {
  saving.value = true;
  error.value = null;
  const username = form.username.trim() || null;
  const body: EmailServerInput = {
    host: form.host.trim(),
    port: form.port,
    security: form.security,
    username,
    from: form.from.trim(),
    ...(needsPassword.value && username ? { password: form.password } : {}),
  };
  try {
    const server = await $fetch<EmailServer>("/api/notifications/email-server", { method: "PUT", body });
    form.password = "";
    changingPassword.value = server.configured && !server.hasPassword;
    emit("change", server);
    toast.add({ title: "Saved the email server", color: "success" });
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    saving.value = false;
  }
}

async function turnOff() {
  removing.value = true;
  try {
    await $fetch("/api/notifications/email-server", { method: "DELETE" });
    Object.assign(form, { host: "", port: 587, security: "starttls", username: "", password: "", from: "" });
    changingPassword.value = true;
    emit("change", { configured: false });
    toast.add({ title: "Email turned off", color: "success" });
  } catch (err) {
    toast.add({ title: "Couldn't turn email off", description: apiErrorMessage(err), color: "error" });
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <section aria-labelledby="email-server-title" class="rounded-(--ui-radius) border border-default bg-muted">
    <header class="border-b border-default px-4 py-3">
      <h2 id="email-server-title" class="text-base font-semibold text-highlighted">Email server</h2>
      <p class="text-muted">
        <template v-if="server.configured">Saved {{ formatAgo(server.updatedAt) }}. Email destinations send through it.</template>
        <template v-else>Not set up: email destinations can't send.</template>
      </p>
    </header>
    <form class="space-y-4 px-4 py-4" @submit.prevent="save">
      <UAlert v-if="error" color="error" variant="subtle" :title="error" />
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_2fr]">
        <UFormField label="SMTP host">
          <UInput v-model="form.host" autocomplete="off" placeholder="smtp.example.com" required class="w-full font-mono" />
        </UFormField>
        <UFormField label="Port">
          <UInput v-model.number="form.port" type="number" min="1" max="65535" required class="w-full" />
        </UFormField>
        <UFormField label="Security">
          <USelect v-model="form.security" :items="securityItems" class="w-full" />
        </UFormField>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UFormField label="Username" help="Empty if the server doesn't ask for a sign-in.">
          <UInput v-model="form.username" autocomplete="off" class="w-full" />
        </UFormField>
        <UFormField
          label="Password"
          :help="accountChanged && initial?.hasPassword ? 'Enter it again for the changed server.' : 'Stored encrypted; never shown again.'"
        >
          <UInput
            v-if="needsPassword"
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            :disabled="form.username.trim() === ''"
            class="w-full"
          />
          <div v-else class="flex items-center justify-between gap-3 rounded-(--ui-radius) border border-default px-3 py-1.5">
            <span class="text-toned">Saved</span>
            <UButton label="Change" size="xs" color="neutral" variant="outline" @click="changingPassword = true" />
          </div>
        </UFormField>
        <UFormField label="From" help="Sender shown on alert emails.">
          <UInput v-model="form.from" maxlength="200" placeholder="Monli <alerts@example.com>" required class="w-full" />
        </UFormField>
      </div>
      <div class="flex gap-2">
        <UButton type="submit" label="Save" :loading="saving" :disabled="!valid" />
        <UButton v-if="server.configured" label="Turn off" color="neutral" variant="ghost" :loading="removing" @click="turnOff" />
      </div>
    </form>
  </section>
</template>
