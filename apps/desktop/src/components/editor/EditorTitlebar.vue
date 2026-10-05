<script setup lang="ts">
import { computed, provide, reactive } from 'vue';
import { popoverOpenStateKey } from '~/ui/popover/popover-interaction-types';

const openPopovers = reactive(new Set<string>());
provide(popoverOpenStateKey, (id, open) => {
  if (open) openPopovers.add(id);
  else openPopovers.delete(id);
});
const dismissible = computed(() => openPopovers.size > 0);
</script>

<template>
  <header class="editor-titlebar" :class="{ 'is-dismissible': dismissible }">
    <div class="left-region">
      <div class="left-actions"><slot name="left" /></div>
      <div class="titlebar-drag-region" aria-hidden="true" />
    </div>
    <div class="center-actions"><slot name="center" /></div>
    <div class="right-region">
      <div class="right-actions"><slot name="right" /></div>
    </div>
  </header>
</template>

<style scoped>
.editor-titlebar {
  height: var(--editor-titlebar-height);
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(160px, 22vw, 260px) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  box-sizing: border-box;
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
  container-type: inline-size;
  -webkit-app-region: drag;
  app-region: drag;
}
.left-region,
.right-region {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
}
.left-region {
  padding-left: max(10px, env(titlebar-area-x, 0px));
}
.right-region {
  justify-content: flex-end;
  padding-right: max(10px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)));
}
.left-actions,
.center-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  zoom: var(--ui-scale-topbar, 1);
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.center-actions {
  justify-content: center;
}
.titlebar-drag-region {
  flex: 1;
  min-width: 12px;
  height: 100%;
  -webkit-app-region: drag;
  app-region: drag;
}
.is-dismissible,
.is-dismissible .titlebar-drag-region {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
@container (max-width: 1100px) {
  .left-actions {
    --editor-back-label-display: none;
    --editor-back-padding: 6px;
    --editor-back-gap: 0px;
    --editor-preset-max-width: 96px;
  }
  .right-actions {
    --editor-copy-label-display: none;
    --editor-dimensions-label-display: none;
  }
}
@container (max-width: 900px) {
  .left-actions {
    --editor-preset-name-display: none;
    gap: 4px;
  }
  .right-actions {
    gap: 4px;
  }
}
</style>
<style src="./layout/editor-layout-tokens.css"></style>
