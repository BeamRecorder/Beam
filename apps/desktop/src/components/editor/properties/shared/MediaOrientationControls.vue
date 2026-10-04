<script setup lang="ts">
import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw } from '@lucide/vue';
import { normalizeMediaRotation } from '@beam/engine/layout/media-rotation';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { MediaOrientationProps, MediaOrientationEmits } from './media-orientation-types';

const props = withDefaults(defineProps<MediaOrientationProps>(), { showMirroring: true });
const emit = defineEmits<MediaOrientationEmits>();
const { t } = useTranslate('ClipPropertiesPanel');
const { t: transformText } = useTranslate('TransformControls');
const editAngle = (value: string | number) => {
  if (String(value).trim() === '' || !Number.isFinite(Number(value))) return;
  emit('update:rotation', normalizeMediaRotation(Number(value)));
};
const rotate = (delta: number) => emit('update:rotation', normalizeMediaRotation((props.rotation ?? 0) + delta));
</script>

<template>
  <div class="orientation-controls" role="group" :aria-label="transformText('orientation')">
    <div class="angle-field">
      <Input
        :model-value="Math.round((rotation ?? 0) * 100) / 100"
        type="number"
        appearance="neutral"
        size="xs"
        commit-on-blur
        :min="-360"
        :max="360"
        :step="0.1"
        :aria-label="transformText('rotation')"
        @update:model-value="editAngle"
        ><template #suffix>°</template></Input
      >
    </div>
    <Button
      v-if="showMirroring !== false"
      :variant="mirrored ? 'selected' : 'ghost'"
      size="xs"
      icon-only
      :icon="FlipHorizontal"
      :aria-pressed="!!mirrored"
      :aria-label="t('mirrorHorizontally')"
      :tooltip="t('mirrorHorizontally')"
      @click="emit('update:mirrored', !mirrored)"
    />
    <Button
      v-if="showMirroring !== false"
      :variant="mirroredY ? 'selected' : 'ghost'"
      size="xs"
      icon-only
      :icon="FlipVertical"
      :aria-pressed="!!mirroredY"
      :aria-label="t('mirrorVertically')"
      :tooltip="t('mirrorVertically')"
      @click="emit('update:mirroredY', !mirroredY)"
    />
    <Button
      variant="ghost"
      size="xs"
      icon-only
      :icon="RotateCcw"
      :aria-label="transformText('rotateLeft')"
      :tooltip="transformText('rotateLeft')"
      @click="rotate(-90)"
    />
    <Button
      variant="ghost"
      size="xs"
      icon-only
      :icon="RotateCw"
      :aria-label="transformText('rotateRight')"
      :tooltip="transformText('rotateRight')"
      @click="rotate(90)"
    />
  </div>
</template>

<style scoped>
.angle-field {
  flex: 1;
  min-width: 0;
}
.orientation-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
