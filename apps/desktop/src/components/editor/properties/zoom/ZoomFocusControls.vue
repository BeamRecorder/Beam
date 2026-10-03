<script setup lang="ts">
import Input from '~/ui/input/Input.vue';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { clampFocusToScale } from '@beam/engine/zoom/zoom-playback';
import { ZOOM_DEPTH_SCALES } from '@beam/engine/zoom/zoom-types';
import { useTranslate } from '~/i18n/useTranslate';
import type { ZoomFocusControlProps } from './zoom-control-types';
const props = defineProps<ZoomFocusControlProps>();
const emit = defineEmits<{ (event: 'update', value: ZoomElement): void }>();
const { t } = useTranslate('GlassHighlight');
const coordinate = (axis: 'cx' | 'cy', value: string | number) => {
  if (props.zoom.locked || String(value).trim() === '' || !Number.isFinite(Number(value))) return;
  const dimension = props.canvasSize ? props.canvasSize[axis === 'cx' ? 'width' : 'height'] : 100;
  const focus = { ...props.zoom.focus, [axis]: Math.min(1, Math.max(0, Number(value) / dimension)) };
  emit('update', {
    ...props.zoom,
    focus: props.zoom.effect === 'glass' ? focus : clampFocusToScale(focus, ZOOM_DEPTH_SCALES[props.zoom.depth]),
  });
};
</script>
<template>
  <div class="position-row">
    <span>{{ t('position') }}</span>
    <Input
      v-for="(axis, index) in ['cx', 'cy'] as const"
      :key="axis"
      :model-value="Math.round(zoom.focus[axis] * (canvasSize ? canvasSize[index === 0 ? 'width' : 'height'] : 100))"
      type="number"
      commit-on-blur
      size="sm"
      appearance="neutral"
      :unit="canvasSize ? 'px' : '%'"
      :disabled="zoom.locked"
      :aria-label="t(index === 0 ? 'positionX' : 'positionY')"
      @update:model-value="coordinate(axis, $event)"
      ><template #prefix>{{ index === 0 ? 'X' : 'Y' }}</template></Input
    >
  </div>
</template>
<style scoped>
.position-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}
.position-row > span {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
</style>
