<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import { Check, Crop, MousePointer2, PanelLeft, RotateCcw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import ArrowScroll from '~/ui/scroll-shadow/ArrowScroll.vue';
import type { PopoverMenuItem } from '~/ui/popover/popover-menu-types';
import ScreenshotDockMore from './ScreenshotDockMore.vue';
import ScreenshotDockTools from './ScreenshotDockTools.vue';
import EditorHistoryControls from '../editor/EditorHistoryControls.vue';
import type { ScreenshotToolbarProps } from './screenshot-toolbar-types';
import type { EditorInsertKind } from '../editor/search/editor-search-types';
import type { ScreenshotDockToolId } from './screenshot-dock-types';
import { isDockTool } from './screenshot-dock-model';
import { useScreenshotDock } from './useScreenshotDock';
import { screenshotDockTools } from './screenshot-dock-tools';

const props = defineProps<ScreenshotToolbarProps>();
const emit = defineEmits<{
  add: [kind: EditorInsertKind];
  select: [];
  crop: [];
  canvas: [];
  undo: [];
  redo: [];
  toggleInspector: [];
  resize: [height: number];
  group: [];
  ungroup: [];
}>();
const toolbar = ref<HTMLElement | null>(null),
  scroller = ref<InstanceType<typeof ArrowScroll> | null>(null);
const focusInspector = () => toolbar.value?.querySelector<HTMLButtonElement>('button[aria-controls]')?.focus();
defineExpose({ focusInspector });
const bounds = useElementSize(toolbar, { width: 0, height: 0 }, { box: 'border-box' });
watch(bounds.height, (height) => emit('resize', height));
const { t } = useI18n(),
  dock = useScreenshotDock();
const tools = computed(() => screenshotDockTools(props, t));
const pinnedTools = computed(() =>
  dock.pinned.value.map((id) => tools.value.find((tool) => tool.id === id)).filter((tool) => tool !== undefined),
);
const moreItems = computed<PopoverMenuItem[]>(() => [
  ...tools.value.filter((tool) => !dock.pinned.value.includes(tool.id)),
  {
    id: 'remove-tool',
    label: t('ScreenshotEditor.removeFromDock'),
    disabled: !pinnedTools.value.length,
    children: pinnedTools.value.map(({ id, label, icon }) => ({ id: `remove:${id}`, label, icon })),
  },
  { id: 'reset-tools', label: t('ScreenshotEditor.resetToolbar'), icon: RotateCcw, separatorBefore: true },
]);
const runTool = (id: ScreenshotDockToolId) => {
  if (props.disabled || tools.value.find((tool) => tool.id === id)?.disabled) return;
  const added = !dock.pinned.value.includes(id);
  dock.pin(id);
  if (id === 'canvas') emit('canvas');
  else if (id === 'group') emit('group');
  else if (id === 'ungroup') emit('ungroup');
  else emit('add', id);
  if (added) void nextTick(() => scroller.value?.revealEnd());
};
const selectMore = (id: string) => {
  if (props.disabled || props.cropping) return;
  if (id === 'reset-tools') dock.reset();
  else if (id.startsWith('remove:')) {
    const tool = id.slice(7);
    if (isDockTool(tool)) dock.remove(tool);
  } else if (isDockTool(id)) runTool(id);
};
const activeTools = computed<ScreenshotDockToolId[]>(() => [
  ...(props.drawing ? ['drawing' as const] : []),
  ...(props.editingText ? ['text' as const] : []),
  ...(props.panel === 'canvas' && props.inspectorOpen ? ['canvas' as const] : []),
]);
const toolStyle = { width: '36px', height: '36px', padding: '0' };
const navigate = (event: KeyboardEvent) => {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
  )
    return;
  const buttons = [
      ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ],
    index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
};
</script>

<template>
  <div
    ref="toolbar"
    class="screenshot-toolbar screenshot-chrome"
    role="toolbar"
    :aria-label="t('ScreenshotEditor.tools')"
    @keydown="navigate"
  >
    <div class="tool-group fixed-tools">
      <Button
        :variant="!drawing && !cropping && !editingText ? 'primary' : 'ghost'"
        size="sm"
        icon-only
        :icon="MousePointer2"
        :style="toolStyle"
        :disabled="disabled"
        :aria-label="t('ScreenshotEditor.selectTool')"
        :tooltip="t('ScreenshotEditor.selectTool')"
        :aria-pressed="!drawing && !cropping && !editingText"
        @click="emit('select')"
      />
      <Button
        :variant="cropping ? 'primary' : 'ghost'"
        size="sm"
        :icon-only="!cropping"
        :icon="cropping ? Check : Crop"
        :style="cropping ? { height: '36px' } : toolStyle"
        :disabled="disabled || (!cropping && !canCrop)"
        :aria-label="t(cropping ? 'CanvasToolbar.confirmCrop' : 'ScreenshotEditor.crop')"
        :tooltip="cropping ? undefined : t('ScreenshotEditor.crop')"
        :aria-pressed="cropping"
        @click="emit('crop')"
        ><template v-if="cropping">{{ t('CanvasToolbar.ok') }}</template></Button
      >
    </div>
    <span class="tool-divider" aria-hidden="true" />
    <ArrowScroll
      ref="scroller"
      class="tool-scroll"
      :disabled="disabled"
      :left-label="t('ScreenshotEditor.scrollToolsLeft')"
      :right-label="t('ScreenshotEditor.scrollToolsRight')"
    >
      <ScreenshotDockTools
        :tools="pinnedTools"
        :active="activeTools"
        :disabled="disabled || cropping"
        @run="runTool"
        @remove="dock.remove"
        @reorder="dock.reorder"
      />
    </ArrowScroll>
    <div class="tool-group fixed-tools">
      <ScreenshotDockMore :items="moreItems" :disabled="disabled || cropping" @select="selectMore" />
    </div>
    <span class="tool-divider" aria-hidden="true" />
    <div class="tool-group fixed-tools">
      <Button
        :variant="inspectorOpen ? 'secondary' : 'ghost'"
        size="sm"
        :icon="PanelLeft"
        :disabled="disabled"
        :aria-label="t('PropertiesPanel.properties')"
        :aria-pressed="inspectorOpen"
        :aria-expanded="inspectorOpen"
        aria-controls="screenshot-properties-panel"
        @click="emit('toggleInspector')"
        ><span class="properties-label">{{ t('PropertiesPanel.properties') }}</span></Button
      >
      <EditorHistoryControls
        :can-undo="canUndo && !disabled"
        :can-redo="canRedo && !disabled"
        tooltip-position="top"
        @undo="emit('undo')"
        @redo="emit('redo')"
      />
    </div>
  </div>
</template>

<style scoped>
.screenshot-toolbar {
  position: relative;
  z-index: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  -webkit-app-region: no-drag;
}
.tool-group {
  display: flex;
  align-items: center;
  gap: 2px;
  zoom: var(--ui-scale-canvas-controls, 1);
}
.fixed-tools {
  flex-shrink: 0;
}
.tool-scroll {
  flex: 1;
  min-width: 0;
  max-width: 300px;
}
.tool-divider {
  width: 1px;
  height: 20px;
  flex-shrink: 0;
  background: var(--color-border);
}
@media (max-width: 720px) {
  .properties-label {
    display: none;
  }
}
</style>
<style scoped src="./screenshot-chrome.css"></style>
