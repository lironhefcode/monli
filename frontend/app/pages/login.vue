<script setup lang="ts">
definePageMeta({ layout: false });

const route = useRoute();
const { loadSession } = useAuth();

const form = reactive({ email: "", password: "" });
const signingIn = ref(false);
const error = ref<string | null>(null);

async function signIn() {
  signingIn.value = true;
  error.value = null;
  const { error: signInError } = await authClient.signIn.email({ email: form.email.trim(), password: form.password });
  if (signInError) {
    error.value = signInError.status === 401 ? "Wrong email or password." : (signInError.message ?? "Sign-in failed.");
    signingIn.value = false;
    return;
  }
  await loadSession();
  // Only same-site paths, so the redirect can't send the user elsewhere.
  const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/") && !route.query.redirect.startsWith("//") ? route.query.redirect : "/";
  await navigateTo(redirect);
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4">
    <section aria-labelledby="login-title" class="w-full max-w-sm rounded-(--ui-radius) border border-default bg-muted">
      <header class="border-b border-default px-5 py-4">
        <p class="text-lg font-semibold text-highlighted">Monli</p>
        <h1 id="login-title" class="text-muted">Sign in to continue</h1>
      </header>

      <form class="space-y-4 px-5 py-5" @submit.prevent="signIn">
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
        <UFormField label="Email">
          <UInput v-model="form.email" type="email" autocomplete="username" required autofocus class="w-full" />
        </UFormField>
        <UFormField label="Password">
          <UInput v-model="form.password" type="password" autocomplete="current-password" required class="w-full" />
        </UFormField>
        <UButton type="submit" label="Sign in" :loading="signingIn" block />
      </form>
    </section>
  </main>
</template>
