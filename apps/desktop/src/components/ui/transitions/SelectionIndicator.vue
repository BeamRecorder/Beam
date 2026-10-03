<script setup lang="ts">
defineProps<{ instant?: boolean }>();
</script>

<template>
  <span class="selection-indicator" :class="{ 'is-instant': instant }" aria-hidden="true" />
</template>

<style scoped>
.selection-indicator {
  display: block;
  pointer-events: none;
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.selection-indicator.is-instant {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .selection-indicator {
    transition: none;
  }
}
</style>
