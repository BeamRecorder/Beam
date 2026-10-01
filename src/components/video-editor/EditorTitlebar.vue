<template>
  <header class="editor-titlebar">
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
  height: max(40px, calc(40px * var(--ui-scale-topbar, 1)));
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
@container (max-width: 1100px) {
  .left-actions {
    --editor-back-label-display: none;
    --editor-back-padding: 6px;
    --editor-back-gap: 0px;
    --editor-preset-max-width: 96px;
  }
  .right-actions {
    --editor-copy-label-display: none;
  }
}
</style>
