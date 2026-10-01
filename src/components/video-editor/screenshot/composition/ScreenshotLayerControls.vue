<script setup lang="ts">
import { computed } from 'vue';
import Select from '~/ui/select/Select.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { LAYER_BLEND_MODES } from '~/media/shared/layer-compositing';
import type { LayerBlendMode, LayerCompositing } from '~/media/shared/layer-compositing-types';
import type { ScreenshotLayerControlsProps } from './screenshot-layer-controls-types';
const props = defineProps<ScreenshotLayerControlsProps>();
const emit = defineEmits<{ update: [patch: Partial<LayerCompositing>] }>();
const { t } = useTranslate('ScreenshotComposition');
const { t: blendText } = useTranslate('BlendModes');
const blendOptions = computed(() => LAYER_BLEND_MODES.map((value) => ({ value, label: blendText(value) })));
const update = (patch: Partial<LayerCompositing>) => {
  if (props.layer && !props.disabled && !props.layer.locked) emit('update', patch);
};
</script>

<template>
  <fieldset class="compositing-controls" :disabled="disabled || !layer || layer.locked">
    <Select
      size="sm"
      :aria-label="t('blendMode')"
      :model-value="layer?.blendMode ?? 'source-over'"
      :options="blendOptions"
      :disabled="disabled || !layer || layer.locked"
      @update:model-value="update({ blendMode: $event as LayerBlendMode })"
    />
    <BigSlider
      :model-value="layer?.opacity ?? 100"
      :label="t('opacity')"
      :min="0"
      :max="100"
      :step="1"
      :default-value="100"
      :format-value="(value) => `${value}%`"
      @update:model-value="update({ opacity: $event })"
    />
  </fieldset>
</template>

<style scoped src="./screenshot-composition.css"></style>
