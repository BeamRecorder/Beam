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
  color: var(--text-secondary, #9ca3af);
  background: repeating-conic-gradient(rgba(255, 255, 255, 0.1) 0 25%, rgba(0, 0, 0, 0.3) 0 50%) 50% / 10px 10px;
  border: 1.5px dashed var(--color-border, rgba(255, 255, 255, 0.15));
  border-radius: 10px;
  box-sizing: border-box;
  cursor: pointer;
  transition:
    transform 120ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.add-tile-button:hover:not(.active) {
  border: 2px dashed rgba(255, 255, 255, 0.5);
  transform: scale(1.04);
}

.add-tile-button.active {
  border: 2px solid var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px var(--color-primary-light, rgba(59, 130, 246, 0.4));
}

@media (prefers-reduced-motion: reduce) {
  .add-tile-button {
    transition: none;
  }
}
</style>
