<script setup lang="ts">
import { computed, useId } from 'vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import Checkbox from '~/ui/checkbox/Checkbox.vue';
import Input from '~/ui/input/Input.vue';
import Select from '~/ui/select/Select.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { OUTPUT_CANVAS_PRESETS, type OutputCanvasSettings } from '../canvas/output-canvas';
import type { ScreenshotDimensions } from './screenshot-types';
import { resizeScreenshotCanvas, screenshotCanvasPreset } from './screenshot-dimensions';

const props = defineProps<{ original: ScreenshotDimensions }>();
const canvas = defineModel<OutputCanvasSettings>('canvas', { required: true });
const advanced = defineModel<boolean>('advanced', { required: true });
const keepAspect = defineModel<boolean>('keepAspect', { required: true });
const { t } = useTranslate('ScreenshotEditor');
const controlsId = useId();
const options = computed(() => [
  { value: 'original', label: t('originalSize'), description: `${props.original.width} × ${props.original.height}` },
  ...Object.values(OUTPUT_CANVAS_PRESETS).map((item) => ({
    value: item.preset,
    label: item.preset,
    description: `${item.width} × ${item.height}`,
  })),
]);
const selected = computed(() => {
  if (canvas.value.width === props.original.width && canvas.value.height === props.original.height) return 'original';
  return (
    Object.values(OUTPUT_CANVAS_PRESETS).find(
      (item) => item.width === canvas.value.width && item.height === canvas.value.height,
    )?.preset ?? 'custom'
  );
});
const sizeOptions = computed(() =>
  selected.value === 'custom'
    ? [
        ...options.value,
        { value: 'custom', label: t('customSize'), description: `${canvas.value.width} × ${canvas.value.height}` },
      ]
    : options.value,
);
</script>

<template>
  <section class="size-controls" :aria-label="t('dimensions')">
    <div class="size-heading">
      <h3>{{ t('dimensions') }}</h3>
      <AdvancedButton v-model:open="advanced" :controls="controlsId" :label="t('advanced')" />
    </div>
    <div v-if="advanced" :id="controlsId" class="advanced-size">
      <div class="dimensions">
        <label
          >{{ t('width')
          }}<Input
            :model-value="canvas.width"
            type="number"
            :min="1"
            :max="16384"
            :aria-label="t('width')"
            @update:model-value="canvas = resizeScreenshotCanvas(canvas, 'width', $event, keepAspect)"
        /></label>
        <span class="dimension-separator" aria-hidden="true">×</span>
        <label
          >{{ t('height')
          }}<Input
            :model-value="canvas.height"
            type="number"
            :min="1"
            :max="16384"
            :aria-label="t('height')"
            @update:model-value="canvas = resizeScreenshotCanvas(canvas, 'height', $event, keepAspect)"
        /></label>
      </div>
      <Checkbox v-model="keepAspect" :label="t('keepAspectRatio')" size="sm" />
    </div>
    <Select
      v-else
      :model-value="selected"
      :options="sizeOptions"
      :aria-label="t('sizePreset')"
      size="md"
      @update:model-value="canvas = screenshotCanvasPreset(canvas, String($event), original)"
    />
  </section>
</template>

<style scoped>
.size-controls,
.advanced-size {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.size-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.size-heading h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.dimensions {
  display: flex;
  align-items: end;
  gap: 8px;
}
.dimensions label {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.dimension-separator {
  padding-bottom: 10px;
  color: var(--text-secondary);
}
</style>
