<script setup lang="ts">
import { computed, ref } from 'vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import { normalizeRecordlyZoom } from '@beam/engine/zoom/recordly-settings';
import type { ZoomAutoFollowSettings } from '@beam/engine/zoom/zoom-types';
import type { RecordlyBlurControl } from './recordly-control-types';
import { RECORDLY_BLUR_CONTROLS } from './recordly-controls';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('ZoomPanel');
const props = defineProps<{ modelValue: ZoomAutoFollowSettings }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: ZoomAutoFollowSettings): void }>();
const settings = computed(() => normalizeRecordlyZoom(props.modelValue.recordly));
const defaults = normalizeRecordlyZoom(undefined).zoomMotionBlurTuning;
const advanced = ref(false);
const update = (key: RecordlyBlurControl['key'], value: number) =>
  emit('update:modelValue', {
    ...props.modelValue,
    recordly: { ...settings.value, zoomMotionBlurTuning: { ...settings.value.zoomMotionBlurTuning, [key]: value } },
  });
</script>
<template>
  <div class="blur-controls">
    <AdvancedButton
      :open="advanced"
      controls="recordly-blur-advanced"
      :label="t('advanced')"
      @update:open="advanced = $event"
    />
    <RafRevealTransition>
      <div v-if="advanced" id="recordly-blur-advanced" class="fields">
        <BigSlider
          v-for="control in RECORDLY_BLUR_CONTROLS"
          :key="control.key"
          :model-value="settings.zoomMotionBlurTuning[control.key]"
          :min="control.min"
          :max="control.max"
          :step="control.step"
          :default-value="defaults[control.key]"
          :label="t(control.label)"
          :format-value="(value) => `${Number(value.toFixed(3))}${control.unit ? ` ${control.unit}` : ''}`"
          @update:model-value="update(control.key, $event)"
        />
      </div>
    </RafRevealTransition>
  </div>
</template>
<style scoped>
.blur-controls,
.fields {
  display: grid;
  gap: 12px;
}
</style>
