<script setup lang="ts">
import { computed } from 'vue';
import type { CaptionShapePreset, CaptionShapeStyle } from '~/media/shared/caption-shape-types';
import { useTranslate } from '~/i18n/useTranslate';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';

const props = defineProps<{ modelValue: CaptionShapeStyle }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: CaptionShapeStyle): void }>();
const { t } = useTranslate('CaptionClipPanel');

const presets = computed<Array<{ value: CaptionShapePreset; label: string }>>(() => [
  { value: 'square', label: t('shapeSquare') },
  { value: 'rounded', label: t('shapeRounded') },
  { value: 'pill', label: t('shapePill') },
  { value: 'custom', label: t('shapeCustom') },
]);

const update = (patch: Partial<CaptionShapeStyle>) => emit('update:modelValue', { ...props.modelValue, ...patch });
const selectPreset = (preset: CaptionShapePreset) =>
  update({ preset, ...(props.modelValue.opacity === 0 && props.modelValue.blur === 0 ? { opacity: 50 } : {}) });
</script>

<template>
  <div class="section-block caption-shape-controls">
    <span class="section-title">{{ t('captionShape') }}</span>
    <ButtonGroup full :aria-label="t('captionShape')">
      <Button
        v-for="preset in presets"
        :key="preset.value"
        size="xs"
        :variant="modelValue.preset === preset.value ? 'primary' : 'ghost'"
        :aria-label="preset.label"
        @click="selectPreset(preset.value)"
      >
        {{ preset.label }}
      </Button>
    </ButtonGroup>
    <BigSlider
      v-if="modelValue.preset === 'custom'"
      :label="t('shapeRadius')"
      :model-value="modelValue.radius"
      :min="0"
      :max="100"
      :step="1"
      :default-value="35"
      :format-value="(value) => `${value}%`"
      @update:model-value="update({ radius: $event })"
    />
    <div class="sub-group">
      <span class="sub-label">{{ t('shapeColor') }}</span>
      <ColorPicker
        :model-value="modelValue.color"
        :show-label="false"
        @update:model-value="update({ color: $event })"
      />
    </div>
    <BigSlider
      :label="t('shapeOpacity')"
      :model-value="modelValue.opacity"
      :min="0"
      :max="100"
      :step="1"
      :default-value="0"
      :format-value="(value) => `${value}%`"
      @update:model-value="update({ opacity: $event })"
    />
    <BigSlider
      :label="t('shapeBlur')"
      :model-value="modelValue.blur"
      :min="0"
      :max="48"
      :step="1"
      :default-value="0"
      :format-value="(value) => `${value}px`"
      @update:model-value="update({ blur: $event })"
    />
    <BigSlider
      :label="t('shapePadding')"
      :model-value="modelValue.padding"
      :min="0"
      :max="100"
      :step="1"
      :default-value="30"
      :format-value="(value) => `${value}%`"
      @update:model-value="update({ padding: $event })"
    />
  </div>
</template>

<style scoped>
.section-block,
.sub-group {
  display: flex;
  flex-direction: column;
}
.section-block {
  gap: 10px;
}
.sub-group {
  gap: 6px;
  width: 100%;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
</style>
