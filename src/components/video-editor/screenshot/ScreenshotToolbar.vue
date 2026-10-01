<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import { Crop, MousePointer2, Paintbrush, PanelLeft } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import ScreenshotAddMenu from './ScreenshotAddMenu.vue';
import EditorHistoryControls from '../EditorHistoryControls.vue';
import { editorInsertItems } from '../search/editor-insert-items';
import type { EditorInsertKind } from '../search/editor-search-types';
import type { ScreenshotToolbarProps } from './screenshot-toolbar-types';

defineProps<ScreenshotToolbarProps>();
const emit = defineEmits<{
  add: [kind: EditorInsertKind];
  select: [];
  crop: [];
  canvas: [];
  undo: [];
  redo: [];
  toggleInspector: [];
  resize: [height: number];
}>();
const toolbar = ref<HTMLElement | null>(null);
const focusInspector = () => toolbar.value?.querySelector<HTMLButtonElement>('button[aria-controls]')?.focus();
defineExpose({ focusInspector });
const bounds = useElementSize(toolbar, { width: 0, height: 0 }, { box: 'border-box' });
watch(bounds.height, (height) => emit('resize', height));
const { t } = useI18n();
const tools = computed(() =>
  editorInsertItems('screenshot', t).filter((item) => ['shape', 'text', 'drawing', 'image'].includes(item.id)),
);
const toolStyle = { width: '36px', height: '36px', padding: '0' };
const navigate = (event: KeyboardEvent) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const toolbar = event.currentTarget as HTMLElement;
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
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
    <div class="tool-group">
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
        icon-only
        :icon="Crop"
        :style="toolStyle"
        :disabled="disabled || !canCrop"
        :aria-label="t('ScreenshotEditor.crop')"
        :tooltip="t('ScreenshotEditor.crop')"
        :aria-pressed="cropping"
        @click="emit('crop')"
      />
    </div>
    <span class="tool-divider" aria-hidden="true" />
    <div class="tool-group">
      <Button
        v-for="tool in tools"
        :key="tool.id"
        :variant="(tool.id === 'drawing' && drawing) || (tool.id === 'text' && editingText) ? 'primary' : 'ghost'"
        size="sm"
        icon-only
        :icon="tool.icon"
        :style="toolStyle"
        :disabled="disabled || cropping"
        :aria-label="tool.label"
        :tooltip="tool.label"
        :aria-pressed="tool.id === 'drawing' ? drawing : tool.id === 'text' ? editingText : undefined"
        @click="emit('add', tool.id)"
      />
      <ScreenshotAddMenu :disabled="disabled || cropping" direction="up" @add="emit('add', $event)" />
    </div>
    <span class="tool-divider" aria-hidden="true" />
    <div class="tool-group">
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
        >{{ t('PropertiesPanel.properties') }}</Button
      >
      <Button
        :variant="panel === 'canvas' && inspectorOpen ? 'secondary' : 'ghost'"
        size="sm"
        icon-only
        :icon="Paintbrush"
        :style="toolStyle"
        :disabled="disabled || cropping"
        :aria-label="t('ScreenshotEditor.canvas')"
        :tooltip="t('ScreenshotEditor.canvas')"
        :aria-pressed="panel === 'canvas' && inspectorOpen"
        @click="emit('canvas')"
      />
    </div>
    <span class="tool-divider" aria-hidden="true" />
    <div class="tool-group">
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
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
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
.tool-divider {
  width: 1px;
  height: 20px;
  flex-shrink: 0;
  background: var(--color-border);
}
</style>
<style scoped src="./screenshot-chrome.css"></style>
