<script setup lang="ts">
import { computed } from 'vue';
import Select from '~/ui/select/Select.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import ColorInput from '~/ui/input/ColorInput.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { CursorClickEffectSettings, CursorWaterRippleSettings } from '@beam/engine/capture/cursor-settings';
import {
  CURSOR_CLICK_LIMITS,
  CURSOR_RING_DEFAULTS,
  DEFAULT_CURSOR_WATER_RIPPLE,
  normalizeCursorWaterRipple,
} from '@beam/engine/capture/cursor-click-schema';
import { CLICK_RIPPLE_PRESETS, cursorClickOptions } from './cursor-click-options';
const props = defineProps<{ modelValue: CursorClickEffectSettings }>();
const emit = defineEmits<{ 'update:modelValue': [value: CursorClickEffectSettings] }>();
const { t } = useTranslate('CursorPanel');
const options = computed(() => cursorClickOptions(t));
const water = computed(() => normalizeCursorWaterRipple(props.modelValue.water));
const update = (patch: Partial<CursorClickEffectSettings>) => {
  if (props.modelValue.rippleEnabled) emit('update:modelValue', { ...props.modelValue, ...patch });
};
const updateWater = (patch: Partial<CursorWaterRippleSettings>) => update({ water: { ...water.value, ...patch } });
const selectStyle = (value: string | number) => {
  const rippleStyle = CLICK_RIPPLE_PRESETS.find((style) => style === value);
  if (rippleStyle) update({ rippleStyle });
};
const percent = (value: number) => `${Math.round(value)}%`;
const duration = (value: number) => t('secondsValue', { value: (value / 1000).toFixed(2) });
</script>

<template>
  <div v-if="modelValue.rippleEnabled" class="ripple-controls">
    <Select
      :aria-label="t('rippleStyle')"
      :label="t('rippleStyle')"
      :model-value="modelValue.rippleStyle === 'none' ? 'single' : (modelValue.rippleStyle ?? 'single')"
      :options="options"
      appearance="neutral"
      variant="source"
      size="sm"
      :option-height="64"
      @update:model-value="selectStyle"
    />
    <template v-if="modelValue.rippleStyle === 'water'">
      <BigSlider
        :model-value="water.intensity"
        :default-value="DEFAULT_CURSOR_WATER_RIPPLE.intensity"
        :min="CURSOR_CLICK_LIMITS.intensity.min"
        :max="CURSOR_CLICK_LIMITS.intensity.max"
        :step="1"
        :label="t('waterRippleIntensity')"
        :format-value="percent"
        @update:model-value="updateWater({ intensity: $event })"
      />
      <BigSlider
        :model-value="water.spread"
        :default-value="DEFAULT_CURSOR_WATER_RIPPLE.spread"
        :min="CURSOR_CLICK_LIMITS.spread.min"
        :max="CURSOR_CLICK_LIMITS.spread.max"
        :step="1"
        :label="t('waterRippleSpread')"
        :format-value="percent"
        @update:model-value="updateWater({ spread: $event })"
      />
      <BigSlider
        :model-value="water.durationMs"
        :default-value="DEFAULT_CURSOR_WATER_RIPPLE.durationMs"
        :min="CURSOR_CLICK_LIMITS.durationMs.min"
        :max="CURSOR_CLICK_LIMITS.durationMs.max"
        :step="50"
        :label="t('rippleDuration')"
        :format-value="duration"
        @update:model-value="updateWater({ durationMs: $event })"
      />
      <BigSlider
        :model-value="water.width"
        :default-value="DEFAULT_CURSOR_WATER_RIPPLE.width"
        :min="CURSOR_CLICK_LIMITS.width.min"
        :max="CURSOR_CLICK_LIMITS.width.max"
        :step="0.5"
        :label="t('waterRippleSoftness')"
        :format-value="(value) => `${value}%`"
        @update:model-value="updateWater({ width: $event })"
      />
    </template>
    <template v-else>
      <BigSlider
        :model-value="modelValue.rippleSize"
        :default-value="CURSOR_RING_DEFAULTS.rippleSize"
        :min="CURSOR_CLICK_LIMITS.rippleSize.min"
        :max="CURSOR_CLICK_LIMITS.rippleSize.max"
        :step="1"
        :label="t('rippleSize')"
        :format-value="(value) => `${Math.round(value)}px`"
        @update:model-value="update({ rippleSize: $event })"
      />
      <BigSlider
        :model-value="modelValue.rippleOpacity ?? CURSOR_RING_DEFAULTS.rippleOpacity"
        :default-value="CURSOR_RING_DEFAULTS.rippleOpacity"
        :min="0"
        :max="100"
        :step="1"
        :label="t('rippleOpacity')"
        :format-value="percent"
        @update:model-value="update({ rippleOpacity: $event })"
      />
      <BigSlider
        :model-value="modelValue.rippleDurationMs ?? CURSOR_RING_DEFAULTS.rippleDurationMs"
        :default-value="CURSOR_RING_DEFAULTS.rippleDurationMs"
        :min="CURSOR_CLICK_LIMITS.rippleDurationMs.min"
        :max="CURSOR_CLICK_LIMITS.rippleDurationMs.max"
        :step="50"
        :label="t('rippleDuration')"
        :format-value="duration"
        @update:model-value="update({ rippleDurationMs: $event })"
      />
      <BigSlider
        :model-value="modelValue.rippleWidth ?? CURSOR_RING_DEFAULTS.rippleWidth"
        :default-value="CURSOR_RING_DEFAULTS.rippleWidth"
        :min="CURSOR_CLICK_LIMITS.rippleWidth.min"
        :max="CURSOR_CLICK_LIMITS.rippleWidth.max"
        :step="0.5"
        :label="t('rippleWidth')"
        :format-value="(value) => `${value}px`"
        @update:model-value="update({ rippleWidth: $event })"
      />
      <div class="color-control">
        <span class="prop-label">{{ t('rippleColor') }}</span>
        <ColorInput
          :label="t('rippleColor')"
          :aria-label="t('rippleColor')"
          :show-label="false"
          :model-value="modelValue.rippleColor"
          @update:model-value="update({ rippleColor: $event })"
        />
      </div>
    </template>
  </div>
</template>
<style scoped>
.ripple-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.color-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.prop-label {
  font-size: var(--font-size-xs);
  font-weight: var(--weight-title);
  color: var(--text-secondary);
}
</style>
