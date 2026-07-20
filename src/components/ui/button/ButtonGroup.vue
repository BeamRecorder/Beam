<template>
  <div class="btn-group">
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
  width: 100%;
}

.btn-group :deep(.btn-container) {
  flex: 1;
  display: flex;
  min-width: 0;
}

.btn-group :deep(.btn) {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.btn-group :deep(.btn-content) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

:root.dark .btn-group {
  background: #181818 !important;
}
</style>
