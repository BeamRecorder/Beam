<template>
  <div class="btn-group">
    <slot />
  </div>
</template>

<style scoped>
.btn-group {
  display: flex;
  background: var(--color-light-blue-hover) !important;
  border-radius: var(--radius-md);
  padding: 4px;
  border: 1px solid var(--color-border);
  width: 100%;
}

.btn-group :deep(.btn-container) {
  flex: 1;
  display: flex;
}

:root.dark .btn-group {
  background: #181818 !important;
}
</style>
