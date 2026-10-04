<script setup lang="ts">
import type { EditorWorkspaceProps } from './editor-layout-types';
defineProps<EditorWorkspaceProps>();
</script>

<template>
  <div class="editor-workspace" :data-editor-kind="kind">
    <div class="workspace-upper"><slot /></div>
    <slot name="after-upper" />
  </div>
</template>

<style scoped>
.editor-workspace {
  flex: 1;
  min-height: 0;
  padding: var(--editor-workspace-inset);
  display: flex;
  flex-direction: column;
  gap: var(--editor-workspace-gap);
  overflow: hidden;
}
.editor-workspace[data-editor-kind='screenshot'] {
  padding: 0;
  gap: 0;
}
.workspace-upper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--editor-workspace-gap);
  overflow: hidden;
}
</style>
<style src="./editor-layout-tokens.css"></style>
