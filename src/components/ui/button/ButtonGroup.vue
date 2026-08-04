<script setup lang="ts">
defineProps<{
  full?: boolean;
}>();
</script>

<template>
  <div class="btn-group" :class="{ 'full-width': full }">
    <slot />
  </div>
</template>

<style scoped>
.btn-group {
  display: flex;
  background: var(--color-bg-surface-hover) !important;
  border-radius: var(--radius-md);
  padding: 4px;
  border: 1px solid var(--color-border);
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
}

.btn-group.full-width {
  width: 100%;
}

.btn-group :deep(.btn-container) {
  flex: 1;
  display: flex;
  min-width: 0;
}

.btn-group :deep(.btn),
.btn-group :deep(.btn.btn-icon-only) {
  width: 100% !important;
  min-width: 0;
  overflow: hidden;
  justify-content: center;
}

.btn-group :deep(.btn-content) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  justify-content: center;
}

:root.dark .btn-group {
  background: #181818 !important;
}
</style>
