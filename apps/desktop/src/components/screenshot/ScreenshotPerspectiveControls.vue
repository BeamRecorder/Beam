<script setup lang="ts">
import { ref } from 'vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import type { LayerRotation3d } from '@beam/engine/layout/layer-perspective-types';
import type { ScreenshotPerspectiveControlsProps } from './screenshot-perspective-controls-types';
import { useTranslate } from '~/i18n/useTranslate';
const props = defineProps<ScreenshotPerspectiveControlsProps>();
const emit = defineEmits<{ 'update:modelValue': [value: LayerRotation3d] }>();
const { t } = useTranslate('ScreenshotEditor');
const open = ref(false);
const defaults: LayerRotation3d = { x: 0, y: 0, perspective: 1200 };
const update = (key: keyof LayerRotation3d, value: number) => {
  if (!props.disabled) emit('update:modelValue', { ...(props.modelValue ?? defaults), [key]: value });
};
</script>
<template>
  <Accordion v-model="open" appearance="inspector" :title="t('rotation3d')" data-element-section="perspective">
    <div class="perspective-controls" :inert="disabled || undefined" :aria-disabled="disabled || undefined">
      <BigSlider
        v-for="axis in ['x', 'y'] as const"
        :key="axis"
        :model-value="modelValue?.[axis] ?? 0"
        :label="`${t('rotation3d')} ${axis.toUpperCase()}`"
        :min="-80"
        :max="80"
        :step="1"
        :display-precision="2"
        :format-value="(v) => `${v} °`"
        :default-value="0"
        @update:model-value="update(axis, $event)"
      />
      <BigSlider
        :model-value="modelValue?.perspective ?? defaults.perspective"
        :label="t('perspective')"
        :min="200"
        :max="10000"
        :step="10"
        :display-precision="2"
        :default-value="defaults.perspective"
        :format-value="(v) => `${v} px`"
        @update:model-value="update('perspective', $event)"
      />
    </div>
  </Accordion>
</template>
<style scoped>
.perspective-controls[inert] {
  opacity: 0.45;
}
.perspective-controls {
  display: grid;
  gap: 12px;
}
</style>
