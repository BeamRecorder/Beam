<script setup lang="ts">
import { Plus } from '@lucide/vue';

defineProps<{
  label: string;
  active?: boolean;
}>();
</script>

<template>
  <button type="button" class="add-tile-button" :class="{ active }" :aria-label="label">
    <Plus :size="16" />
  </button>
</template>

<style scoped>
.add-tile-button {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  color: var(--text-secondary);
  background: var(--color-bg-field);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-sm);
  box-sizing: border-box;
  cursor: pointer;
  transition:
    transform 120ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.add-tile-button:hover:not(.active) {
  border-color: var(--text-secondary);
  background: var(--color-bg-field-hover);
}

.add-tile-button.active {
  border: 1px solid var(--text-secondary);
  background: var(--color-bg-field-active);
}

.add-tile-button:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .add-tile-button {
    transition: none;
  }
}
</style>
