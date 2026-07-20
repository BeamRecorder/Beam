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

.btn-group :deep(.btn) {
  flex: 1;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  box-shadow: none;
  font-size: 13px;
  font-weight: 600;
  height: auto;
  padding: 6px 12px;
  transition: all 0.2s ease;
  justify-content: center;
}

.btn-group :deep(.btn:hover:not(:disabled)) {
  background: rgba(0, 0, 0, 0.02);
  transform: none;
  box-shadow: none;
}

.btn-group :deep(.btn.active) {
  background: white;
  color: var(--color-orange);
  box-shadow: var(--shadow-sm);
}

.btn-group :deep(.btn.active:hover:not(:disabled)) {
  background: white;
}
</style>
