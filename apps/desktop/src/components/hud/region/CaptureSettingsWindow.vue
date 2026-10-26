<script setup lang="ts">
import { ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import type { QuickSnipSettingsContent } from '~/api/types/quick-snip-settings';
defineProps<{ content: QuickSnipSettingsContent; label: string; preview?: boolean }>();
const emit = defineEmits<{ fit: [height: number] }>();
const panel = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const fit = () => {
  const element = panel.value;
  if (element?.offsetHeight && body.value)
    emit('fit', Math.ceil(body.value.scrollHeight + element.offsetHeight - element.clientHeight));
};
useResizeObserver([panel, body], fit);
defineExpose({ fit });
</script>
<template>
  <div
    class="settings-shell"
    :class="[content.side, { preview, presented: preview || content.visible, 'device-popover': content.device }]"
    :style="{ '--anchor-x': `${content.anchorX}px` }"
    @contextmenu.prevent
  >
    <main
      ref="panel"
      class="quick-settings-window"
      :class="{ 'floating-surface': content.device }"
      :aria-label="label"
      :role="content.device ? undefined : 'dialog'"
    >
      <ScrollShadow class="settings-scroll" stable-scrollbar>
        <div ref="body" class="settings-content"><slot /></div>
      </ScrollShadow>
    </main>
  </div>
</template>
<style scoped src="../../ui/floating-surface.css"></style>
<style scoped>
.settings-shell {
  box-sizing: border-box;
  padding: 10px 10px 16px;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.12);
  transform-origin: var(--anchor-x) bottom;
  transition:
    transform 150ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 100ms ease;
}
.settings-shell.presented {
  opacity: 1;
  transform: scale(1);
}
.settings-shell.device-popover {
  transform: none;
  transition: opacity 100ms ease;
}
.settings-shell.below {
  padding: 16px 10px 10px;
  transform-origin: var(--anchor-x) top;
}
.settings-shell.preview {
  padding: 0;
}
.settings-shell:not(.preview):not(.device-popover)::after {
  content: '';
  position: absolute;
  left: calc(var(--anchor-x) - 5px);
  width: 10px;
  height: 10px;
  background: var(--color-bg-element);
  border-right: 1px solid var(--color-border-strong);
  border-bottom: 1px solid var(--color-border-strong);
  bottom: 11px;
  transform: rotate(45deg);
  pointer-events: none;
}
.settings-shell.below::after {
  top: 11px;
  bottom: auto;
  transform: rotate(225deg);
}
.quick-settings-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--color-bg-element);
  color: var(--text-primary);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  max-height: calc(100vh - 26px);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.preview .quick-settings-window {
  max-height: 100vh;
}
.settings-scroll {
  flex: 1 1 auto;
  border-radius: inherit;
}
.settings-content {
  flex-shrink: 0;
  min-width: 0;
}
.quick-settings-window.floating-surface {
  position: relative;
  z-index: 0;
  background: transparent;
}
@media (prefers-reduced-motion: reduce) {
  .settings-shell,
  .settings-shell.device-popover {
    transition: none;
  }
}
p {
  margin: 0;
  padding: 8px 12px;
  color: var(--color-error);
  font-size: var(--font-size-xs);
}
</style>
