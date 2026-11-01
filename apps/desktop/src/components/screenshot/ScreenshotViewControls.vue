<script setup lang="ts">
import { Maximize2, Scan, SlidersHorizontal, Shrink, ZoomIn, ZoomOut } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { focusPopoverControl } from '~/ui/popover/popover-focus';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuButton from '~/ui/popover/PopoverMenuButton.vue';
import type { PopoverMenuItem } from '~/ui/popover/popover-menu-types';
import ScreenshotSizeControls from './ScreenshotSizeControls.vue';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { ScreenshotViewControlsProps } from './screenshot-view-controls-types';
import type { ScreenshotViewAction } from './screenshot-view-types';

const props = defineProps<ScreenshotViewControlsProps>();
const dimensions = ref<InstanceType<typeof Popover> | null>(null);
const sizePanel = ref<HTMLElement | null>(null);
let releaseFocus = () => {};
onBeforeUnmount(() => releaseFocus());
const openDimensions = async () => {
  if (props.disabled) return;
  if (!dimensions.value?.isOpen) dimensions.value?.toggle();
  await nextTick();
  releaseFocus();
  if (sizePanel.value)
    releaseFocus = focusPopoverControl(
      sizePanel.value,
      'input:not(:disabled),select:not(:disabled),button[aria-haspopup="listbox"]:not(:disabled)',
    );
};
defineExpose({ openDimensions });
const canvas = defineModel<OutputCanvasSettings>('canvas', { required: true });
const advanced = defineModel<boolean>('advanced', { required: true });
const keepAspect = defineModel<boolean>('keepAspect', { required: true });
const emit = defineEmits<{ view: [action: ScreenshotViewAction]; fullscreen: [event: MouseEvent] }>();
const { t } = useI18n();
const viewItems = computed<PopoverMenuItem[]>(() => [
  {
    id: 'fit',
    label: t('CanvasToolbar.fitToWindow'),
    icon: Shrink,
    checked: props.viewMode === 'fit',
    disabled: props.disabled,
  },
  {
    id: 'actual',
    label: t('CanvasToolbar.actualSize'),
    icon: Scan,
    checked: props.viewMode === 'actual',
    disabled: props.disabled,
  },
  { id: 'zoom-in', label: t('CanvasToolbar.zoomIn'), icon: ZoomIn, disabled: props.disabled },
  { id: 'zoom-out', label: t('CanvasToolbar.zoomOut'), icon: ZoomOut, disabled: props.disabled },
]);
const selectView = (action: string) => {
  if (!props.disabled && (action === 'fit' || action === 'actual' || action === 'zoom-in' || action === 'zoom-out'))
    emit('view', action);
};
</script>

<template>
  <div class="screenshot-view-controls">
    <PopoverMenuButton
      :label="`${t('CanvasToolbar.view')} · ${zoomPercent}%`"
      :aria-label="`${t('CanvasToolbar.canvasZoom')}: ${zoomPercent}%`"
      :items="viewItems"
      :disabled="disabled"
      direction="down"
      @select="selectView"
    />
    <Popover
      ref="dimensions"
      direction="down"
      align="right"
      :match-trigger-width="false"
      :disabled="disabled"
      @toggle="!$event && releaseFocus()"
    >
      <template #trigger>
        <Button
          variant="ghost"
          size="sm"
          :icon="SlidersHorizontal"
          :disabled="disabled"
          :aria-label="t('ScreenshotEditor.dimensions')"
        >
          <span class="dimensions-label">{{ canvas.width }} × {{ canvas.height }}</span>
        </Button>
      </template>
      <fieldset ref="sizePanel" class="canvas-size-popover" :disabled="disabled">
        <ScreenshotSizeControls
          :original="document"
          v-model:canvas="canvas"
          v-model:advanced="advanced"
          v-model:keep-aspect="keepAspect"
        />
      </fieldset>
    </Popover>
    <Button
      variant="ghost"
      size="sm"
      icon-only
      :icon="Maximize2"
      :disabled="disabled || !canFullscreen"
      :aria-label="t('TimelineToolbar.fullscreenPreview')"
      :tooltip="t('TimelineToolbar.fullscreenPreview')"
      @click="emit('fullscreen', $event)"
    />
  </div>
</template>

<style scoped>
.screenshot-view-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dimensions-label {
  display: var(--editor-dimensions-label-display, inline);
}
.canvas-size-popover {
  width: 320px;
  max-width: calc(100vw - 48px);
  margin: 0;
  padding: 16px;
  border: 0;
}
</style>
