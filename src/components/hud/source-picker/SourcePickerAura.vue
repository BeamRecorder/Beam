<script setup lang="ts">
defineProps<{ screen?: boolean }>();
</script>

<template><div class="selection-aura" :class="{ screen }" aria-hidden="true" /></template>

<style scoped>
.selection-aura {
  position: fixed;
  inset: 16px;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-lg);
  box-shadow:
    0 0 12px 3px var(--color-primary-border),
    inset 0 0 10px var(--color-primary-border);
  pointer-events: none;
}
.selection-aura.screen {
  inset: 8px;
  border-radius: var(--radius-sm);
}
</style>
