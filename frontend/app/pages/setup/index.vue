<template>
  <div>
    <header class="border-b border-default pb-4">
      <h1 class="text-xl font-semibold text-highlighted">Setup</h1>
      <p class="mt-1 text-muted">Connect hosts, manage who can sign in and where alerts are sent.</p>
    </header>

    <div class="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <AddAgentPanel />

      <section aria-labelledby="users-title" class="rounded-(--ui-radius) border border-default bg-muted">
        <header class="border-b border-default px-4 py-3">
          <h2 id="users-title" class="text-base font-semibold text-highlighted">Users</h2>
          <p class="text-muted">Create accounts and choose what each person can do.</p>
        </header>
        <div class="px-4 py-4">
          <ActionButton requires="admin" label="Manage users" to="/setup/users" />
        </div>
      </section>

      <section aria-labelledby="notifications-title" class="rounded-(--ui-radius) border border-default bg-muted">
        <header class="border-b border-default px-4 py-3">
          <h2 id="notifications-title" class="text-base font-semibold text-highlighted">Notifications</h2>
          <p class="text-muted">Send alerts to Discord, Slack or any webhook.</p>
        </header>
        <div class="px-4 py-4">
          <ActionButton requires="admin" label="Manage webhooks" to="/setup/notifications" />
        </div>
      </section>
    </div>
  </div>
</template>
