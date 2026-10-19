<script setup lang="ts">
// A UButton for actions: users without the role see it disabled, with the
// reason on hover.
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ disabled?: boolean; requires?: "editor" | "admin" }>(), {
  requires: "editor",
});
const { canEdit, isAdmin } = useAuth();
const allowed = computed(() => (props.requires === "admin" ? isAdmin.value : canEdit.value));
</script>

<template>
  <UTooltip :text="`Requires ${requires} role`" :disabled="allowed">
    <!-- Disabled buttons get no pointer events; the wrapper carries the tooltip. -->
    <span class="inline-flex">
      <UButton v-bind="$attrs" :disabled="!allowed || props.disabled" />
    </span>
  </UTooltip>
</template>
