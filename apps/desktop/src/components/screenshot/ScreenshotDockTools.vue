<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import ContextMenu from '~/ui/context-menu/ContextMenu.vue';
import ContextMenuItem from '~/ui/context-menu/ContextMenuItem.vue';
import type { ScreenshotDockTool, ScreenshotDockToolId } from './screenshot-dock-types';
import { useScreenshotDockDrag } from './useScreenshotDockDrag';

const props = defineProps<{ tools: ScreenshotDockTool[]; active: ScreenshotDockToolId[]; disabled: boolean }>();
const emit = defineEmits<{
  run: [id: ScreenshotDockToolId];
  remove: [id: ScreenshotDockToolId];
  reorder: [id: ScreenshotDockToolId, boundary: number];
}>();
const { t } = useI18n();
const row = ref<HTMLElement | null>(null),
  menu = ref<InstanceType<typeof ContextMenu> | null>(null);
const menuContent = ref<HTMLElement | null>(null);
const contextId = ref<ScreenshotDockToolId | null>(null);
let contextTrigger: HTMLButtonElement | null = null;
const drag = useScreenshotDockDrag(
  row,
  () => props.tools,
  () => props.disabled,
  (id, boundary) => emit('reorder', id, boundary),
);
const focusTool = (id: ScreenshotDockToolId) =>
  row.value?.querySelector<HTMLButtonElement>(`[data-dock-tool="${id}"] button`)?.focus();
const openMenu = async (event: MouseEvent | KeyboardEvent, id: ScreenshotDockToolId) => {
  event.preventDefault();
  event.stopPropagation();
  if (props.disabled) return;
  drag.cancel();
  const entry = event.currentTarget as HTMLElement;
  contextTrigger = entry.querySelector('button');
  contextId.value = id;
  const rect = entry.getBoundingClientRect();
  menu.value?.open(
    event instanceof MouseEvent && (event.clientX || event.clientY) ? event : { x: rect.left, y: rect.top },
  );
  await nextTick();
  menuContent.value?.querySelector<HTMLButtonElement>('button')?.focus();
};
const closeMenu = () => {
  const restore = document.activeElement?.closest('.dock-tool-context');
  contextId.value = null;
  if (restore && contextTrigger?.isConnected) contextTrigger.focus();
};
const remove = () => {
  const id = contextId.value;
  if (!id || props.disabled) return;
  const index = props.tools.findIndex((tool) => tool.id === id);
  emit('remove', id);
  void nextTick(() => {
    const next = props.tools[Math.min(index, props.tools.length - 1)];
    if (next) focusTool(next.id);
    else
      row.value?.closest('[role="toolbar"]')?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus();
  });
};
const keyboard = (event: KeyboardEvent, id: ScreenshotDockToolId) => {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    void openMenu(event, id);
    return;
  }
  if (props.disabled || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const index = props.tools.findIndex((tool) => tool.id === id);
  emit('reorder', id, index + (event.key === 'ArrowRight' ? 2 : -1));
  void nextTick(() => focusTool(id));
};
watch(
  () => [props.disabled, props.tools.some((tool) => tool.id === contextId.value)],
  () => {
    if (props.disabled || !props.tools.some((tool) => tool.id === contextId.value)) menu.value?.close();
  },
);
</script>
<template>
  <div ref="row" class="dock-tools" @dragover="drag.over" @drop="drag.drop" @dragleave="drag.outside">
    <div
      v-for="(tool, index) in tools"
      :key="tool.id"
      class="dock-tool"
      :data-dock-tool="tool.id"
      :class="{
        'is-dragging': drag.dragged.value === tool.id,
        'insert-before': drag.marker(index),
        'insert-after': index === tools.length - 1 && drag.marker(tools.length),
      }"
      :draggable="!disabled"
      @dragstart="drag.start($event, tool.id)"
      @dragend="drag.cancel"
      @contextmenu="openMenu($event, tool.id)"
      @keydown="keyboard($event, tool.id)"
    >
      <Button
        :variant="active.includes(tool.id) ? 'primary' : 'ghost'"
        size="sm"
        icon-only
        :icon="tool.icon"
        :style="{ width: '36px', height: '36px', padding: '0' }"
        :disabled="tool.disabled"
        :aria-label="tool.label"
        :tooltip="tool.hint ?? tool.label"
        :tooltip-disabled="drag.dragged.value !== null || contextId === tool.id"
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Shift+F10"
        :aria-pressed="active.includes(tool.id)"
        @click="!drag.dragged.value && emit('run', tool.id)"
      />
    </div>
    <ContextMenu ref="menu" @close="closeMenu">
      <template #default="{ close }"
        ><div ref="menuContent" class="dock-tool-context">
          <ContextMenuItem
            :label="t('ScreenshotEditor.removeFromDock')"
            :icon="X"
            @click="
              remove();
              close();
            "
          /></div
      ></template>
    </ContextMenu>
  </div>
</template>
<style scoped>
.dock-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  width: max-content;
  padding-inline: 4px;
  box-sizing: border-box;
  zoom: var(--ui-scale-canvas-controls, 1);
}
.dock-tool {
  position: relative;
  flex-shrink: 0;
  cursor: grab;
}
.dock-tool.is-dragging {
  opacity: 0.4;
}
.dock-tool.insert-before::before,
.dock-tool.insert-after::after {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 6px;
  box-sizing: border-box;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}
.dock-tool.insert-before::before {
  left: -4px;
}
.dock-tool.insert-after::after {
  right: -4px;
}
</style>
