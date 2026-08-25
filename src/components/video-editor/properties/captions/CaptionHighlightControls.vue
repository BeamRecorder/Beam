<script setup lang="ts">
import { computed } from 'vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Gradient from '~/ui/Gradient/Gradient.vue';
import type { GradientValue } from '~/ui/Gradient/composables/useGradient';
import Select from '~/ui/select/Select.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import type { CaptionHighlightStyle } from '~/media/shared/caption-highlight-types';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<{
  modelValue: CaptionHighlightStyle;
  available: boolean;
  customText: boolean;
}>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: CaptionHighlightStyle): void;
}>();
const { t } = useTranslate('CaptionClipPanel');

const unavailableReason = computed(() =>
  props.customText ? t('highlightCustomTextUnavailable') : t('highlightTimingsUnavailable'),
);
const update = (patch: Partial<CaptionHighlightStyle>) => emit('update:modelValue', { ...props.modelValue, ...patch });

const displayOptions = computed(() => [
  { value: 'sentence', label: t('highlightDisplaySentence') },
  { value: 'word', label: t('highlightDisplayWord') },
]);
const effectOptions = computed(() => [
  { value: 'none', label: t('highlightEffectNone') },
  { value: 'pop', label: t('highlightEffectPop') },
  { value: 'jump', label: t('highlightEffectJump') },
  { value: 'pulse', label: t('highlightEffectPulse') },
]);
</script>

<template>
  <div class="highlight-controls">
    <div class="highlight-header">
      <div class="highlight-copy">
        <span class="section-title">{{ t('highlightText') }}</span>
        <p class="section-desc">{{ t('highlightTextDescription') }}</p>
      </div>
      <Switch
        :model-value="modelValue.enabled"
        :disabled="!available || customText"
        :aria-label="t('highlightText')"
        @update:model-value="update({ enabled: $event })"
      />
    </div>

    <p v-if="!available || customText" class="availability-note" role="status">
      {{ unavailableReason }}
    </p>

    <template v-if="modelValue.enabled && available && !customText">
      <div class="control-group">
        <span class="sub-label">{{ t('highlightDisplay') }}</span>
        <Select
          :model-value="modelValue.displayMode"
          :options="displayOptions"
          size="sm"
          @update:model-value="
            update({
              displayMode: $event as CaptionHighlightStyle['displayMode'],
            })
          "
        />
      </div>

      <div class="control-group">
        <span class="sub-label">{{ t('highlightFill') }}</span>
        <ButtonGroup full :columns="2">
          <Button
            size="xs"
            :variant="modelValue.fill === 'solid' ? 'primary' : 'ghost'"
            @click="update({ fill: 'solid' })"
          >
            {{ t('highlightSolid') }}
          </Button>
          <Button
            size="xs"
            :variant="modelValue.fill === 'gradient' ? 'primary' : 'ghost'"
            @click="update({ fill: 'gradient' })"
          >
            {{ t('highlightGradient') }}
          </Button>
        </ButtonGroup>
      </div>

      <div v-if="modelValue.fill === 'solid'" class="control-group">
        <span class="sub-label">{{ t('highlightColor') }}</span>
        <ColorPicker
          :model-value="modelValue.color"
          :show-label="false"
          @update:model-value="update({ color: $event })"
        />
      </div>
      <div v-else class="control-group gradient-control">
        <span class="sub-label">{{ t('highlightGradient') }}</span>
        <Gradient
          :model-value="modelValue.gradient as GradientValue"
          :min-stops="2"
          :max-stops="6"
          show-angle
          @update:model-value="update({ gradient: $event })"
        />
      </div>

      <div class="control-group">
        <span class="sub-label">{{ t('highlightAnimation') }}</span>
        <Select
          :model-value="modelValue.effect"
          :options="effectOptions"
          size="sm"
          @update:model-value="update({ effect: $event as CaptionHighlightStyle['effect'] })"
        />
      </div>
      <BigSlider
        v-if="modelValue.effect !== 'none'"
        :label="t('highlightIntensity')"
        :model-value="modelValue.intensity"
        :min="0"
        :max="100"
        :step="1"
        :default-value="55"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="update({ intensity: $event })"
      />
      <BigSlider
        v-if="modelValue.displayMode === 'sentence'"
        :label="t('highlightInactiveOpacity')"
        :model-value="modelValue.inactiveOpacity"
        :min="0"
        :max="100"
        :step="1"
        :default-value="72"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="update({ inactiveOpacity: $event })"
      />
    </template>
  </div>
</template>

<style scoped>
.highlight-controls,
.highlight-copy,
.control-group {
  display: flex;
  flex-direction: column;
}
.highlight-controls {
  gap: 12px;
}
.highlight-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.highlight-copy {
  gap: 4px;
}
.control-group {
  gap: 6px;
  width: 100%;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.section-desc,
.availability-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}
.availability-note {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}
.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}
.gradient-control {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  box-sizing: border-box;
}
</style>
