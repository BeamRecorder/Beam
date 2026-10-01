<script setup lang="ts">
import { computed } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import ColorInput from '~/ui/input/ColorInput.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { CursorClickButton, CursorClickEffects } from '../../../../api/types/cursor-settings';

const { t } = useTranslate('CursorPanel');

const props = defineProps<{ modelValue: CursorClickEffects }>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: CursorClickEffects): void;
}>();

const buttons = computed<Array<{ id: CursorClickButton; label: string }>>(() => [
  { id: 'left', label: t('leftClick') },
  { id: 'right', label: t('rightClick') },
]);

const updateEffect = (button: CursorClickButton, patch: Partial<CursorClickEffects['left']>) => {
  emit('update:modelValue', {
    ...props.modelValue,
    [button]: { ...props.modelValue[button], ...patch },
  });
};
</script>

<template>
  <section class="click-effects" :aria-label="t('clicks')">
    <section v-for="button in buttons" :key="button.id" class="click-card" :aria-label="button.label">
      <div class="click-card-header">
        <span class="click-card-title">{{ button.label }}</span>
      </div>

      <div class="prop-row">
        <span class="prop-label">{{ t('clickSpring') }}</span>
        <Switch
          :aria-label="`${button.label}: ${t('clickSpring')}`"
          :model-value="modelValue[button.id].springEnabled"
          @update:modelValue="updateEffect(button.id, { springEnabled: $event })"
        />
      </div>
      <BigSlider
        v-if="modelValue[button.id].springEnabled"
        :model-value="modelValue[button.id].springIntensity"
        :min="0"
        :max="100"
        :step="1"
        :label="t('springIntensity')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:modelValue="updateEffect(button.id, { springIntensity: $event })"
      />

      <div class="prop-row">
        <span class="prop-label">{{ t('clickRippleEffect') }}</span>
        <Switch
          :aria-label="`${button.label}: ${t('clickRippleEffect')}`"
          :model-value="modelValue[button.id].rippleEnabled"
          @update:modelValue="updateEffect(button.id, { rippleEnabled: $event })"
        />
      </div>
      <div v-if="modelValue[button.id].rippleEnabled" class="ripple-options">
        <BigSlider
          :model-value="modelValue[button.id].rippleSize"
          :min="10"
          :max="80"
          :step="1"
          :label="t('rippleSize')"
          :format-value="(value) => `${Math.round(value)}px`"
          @update:modelValue="updateEffect(button.id, { rippleSize: $event })"
        />
        <div class="prop-item">
          <span class="prop-label">{{ t('rippleColor') }}</span>
          <ColorInput
            :label="t('rippleColor')"
            :aria-label="`${button.label}: ${t('rippleColor')}`"
            :show-label="false"
            :model-value="modelValue[button.id].rippleColor"
            @update:modelValue="updateEffect(button.id, { rippleColor: $event })"
          />
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.click-effects {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.click-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
}

.click-card-header,
.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.click-card-title,
.prop-label {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ripple-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}
</style>
