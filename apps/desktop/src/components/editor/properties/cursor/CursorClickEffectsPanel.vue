<script setup lang="ts">
import { reactive } from 'vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Switch from '~/ui/switch/Switch.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import CursorRippleControls from './CursorRippleControls.vue';
import { useTranslate } from '~/i18n/useTranslate';
import {
  createDefaultCursorClickEffects,
  type CursorClickButton,
  type CursorClickEffects,
} from '@beam/engine/capture/cursor-settings';
const props = defineProps<{ modelValue: CursorClickEffects }>();
const emit = defineEmits<{ 'update:modelValue': [value: CursorClickEffects] }>();
const { t } = useTranslate('CursorPanel');
const sections = reactive({ left: false, right: false });
const buttons = ['left', 'right'] as const;
const defaults = createDefaultCursorClickEffects();
const update = (button: CursorClickButton, patch: Partial<CursorClickEffects['left']>) =>
  emit('update:modelValue', { ...props.modelValue, [button]: { ...props.modelValue[button], ...patch } });
const toggleRipple = (button: CursorClickButton, enabled: boolean) =>
  update(button, {
    rippleEnabled: enabled,
    rippleStyle:
      props.modelValue[button].rippleStyle === 'none' ? 'single' : (props.modelValue[button].rippleStyle ?? 'single'),
  });
</script>
<template>
  <div class="click-effects">
    <Accordion
      v-for="button in buttons"
      :key="button"
      v-model="sections[button]"
      appearance="inspector"
      :title="t(button === 'left' ? 'leftClick' : 'rightClick')"
      :data-cursor-section="button"
    >
      <div class="click-controls">
        <div class="prop-row">
          <span class="prop-label">{{ t('clickSpring') }}</span>
          <Switch
            :aria-label="t('clickSpring')"
            :model-value="modelValue[button].springEnabled"
            @update:model-value="update(button, { springEnabled: $event })"
          />
        </div>
        <BigSlider
          v-if="modelValue[button].springEnabled"
          :model-value="modelValue[button].springIntensity"
          :default-value="defaults[button].springIntensity"
          :min="0"
          :max="100"
          :step="1"
          :label="t('springIntensity')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="update(button, { springIntensity: $event })"
        />
        <div class="prop-row">
          <span class="prop-label">{{ t('clickRippleEffect') }}</span>
          <Switch
            :aria-label="t('clickRippleEffect')"
            :model-value="modelValue[button].rippleEnabled"
            @update:model-value="toggleRipple(button, $event)"
          />
        </div>
        <CursorRippleControls :model-value="modelValue[button]" @update:model-value="update(button, $event)" />
      </div>
    </Accordion>
  </div>
</template>
<style scoped>
.click-effects {
  display: flex;
  flex-direction: column;
}
.click-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.prop-label {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--weight-title);
}
</style>
