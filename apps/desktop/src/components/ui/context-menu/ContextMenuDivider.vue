<script setup lang="ts">
// ContextMenuDivider renders a clean horizontal separation line inside the context menu.
</script>

<template>
  <div class="context-menu-divider" role="separator" />
</template>

<style scoped>
.context-menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 5px 7px;
  flex-shrink: 0;
}
</style>
