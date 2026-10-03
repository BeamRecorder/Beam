<script setup lang="ts">
import { Maximize2, RotateCcw, SlidersHorizontal } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { focusPopoverControl } from '~/ui/popover/popover-focus';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import ScreenshotSizeControls from './ScreenshotSizeControls.vue';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { ScreenshotViewControlsProps } from './screenshot-view-controls-types';

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
const emit = defineEmits<{ resetView: []; fullscreen: [event: MouseEvent] }>();
const { t } = useI18n();
</script>

<template>
  <div class="screenshot-view-controls">
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
          :tooltip="`${t('CanvasToolbar.canvasZoom')}: ${zoomPercent}%`"
        >
          {{ canvas.width }} × {{ canvas.height }}
        </Button>
      </template>
      <fieldset ref="sizePanel" class="canvas-size-popover" :disabled="disabled">
        <div class="preview-zoom">
          <span>{{ t('CanvasToolbar.canvasZoom') }}</span>
          <Button
            variant="secondary"
            size="xs"
            :icon="RotateCcw"
            :disabled="disabled"
            :aria-label="t('CanvasToolbar.resetZoom')"
            :tooltip="t('CanvasToolbar.resetZoom')"
            @click="emit('resetView')"
            >{{ zoomPercent }}%</Button
          >
        </div>
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
.canvas-size-popover {
  width: 320px;
  max-width: calc(100vw - 48px);
  margin: 0;
  padding: 16px;
  border: 0;
}
.preview-zoom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}
</style>
