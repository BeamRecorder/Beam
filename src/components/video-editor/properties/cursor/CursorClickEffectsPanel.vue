<script setup lang="ts">
import { computed } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import ColorInput from '~/ui/input/ColorInput.vue';
import Divider from '~/ui/divider/Divider.vue';
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
  <section class="click-effects" aria-label="Click effects">
    <template v-for="(button, index) in buttons" :key="button.id">
      <Divider v-if="index > 0" spacing="xs" />
      <div class="click-card">
        <div class="click-card-header">
          <span class="click-card-title">{{ button.label }}</span>
          <span class="click-badge">{{ button.id === 'left' ? 'L' : 'R' }}</span>
        </div>

        <div class="prop-row">
          <span class="prop-label">{{ t('clickSpring') }}</span>
          <Switch
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
          <ColorInput
            :label="t('rippleColor')"
            :model-value="modelValue[button.id].rippleColor"
            @update:modelValue="updateEffect(button.id, { rippleColor: $event })"
          />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.click-effects {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.click-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
}

.ripple-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}
</style>
