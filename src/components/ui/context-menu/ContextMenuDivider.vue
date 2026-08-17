<script setup lang="ts">
// ContextMenuDivider renders a clean horizontal separation line inside the context menu.
</script>

<template>
  <div class="context-menu-divider" role="separator" />
</template>

<style scoped>
.context-menu-divider {
  height: 1px;
  background: var(--color-border-strong, rgba(255, 255, 255, 0.12));
  margin: 4px 6px;
  flex-shrink: 0;
}
</style>
