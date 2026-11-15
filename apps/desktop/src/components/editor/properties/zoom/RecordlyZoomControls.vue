<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import {
  applyRecordlyZoomPreset,
  recordlyZoomPreset,
  normalizeRecordlyZoom,
} from '@beam/engine/zoom/recordly-settings';
import type { RecordlyZoomSettings, RecordlyZoomPreset } from '@beam/engine/zoom/recordly-settings-types';
import type { ZoomAutoFollowSettings } from '@beam/engine/zoom/zoom-types';
import { RECORDLY_CONTROLS } from './recordly-controls';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('ZoomPanel');
const props = defineProps<{ modelValue: ZoomAutoFollowSettings }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: ZoomAutoFollowSettings): void }>();
const settings = computed(() => normalizeRecordlyZoom(props.modelValue.recordly));
const preset = computed(() => recordlyZoomPreset(settings.value));
const advanced = ref(false);
const update = (patch: Partial<RecordlyZoomSettings>) =>
  emit('update:modelValue', { ...props.modelValue, recordly: normalizeRecordlyZoom({ ...settings.value, ...patch }) });
const choose = (id: RecordlyZoomPreset) =>
  emit('update:modelValue', { ...props.modelValue, recordly: applyRecordlyZoomPreset(settings.value, id) });
</script>
<template>
  <div class="recordly-settings">
    <ButtonGroup
      full
      size="xs"
      variant="neutral"
      :selection="preset ? { index: preset === 'focused' ? 0 : 1, count: 2 } : undefined"
    >
      <Button
        v-for="id in ['focused', 'smooth'] as const"
        :key="id"
        size="xs"
        :variant="preset === id ? 'selected' : 'ghost'"
        :data-recordly-preset="id"
        @click="choose(id)"
        >{{ t(id === 'focused' ? 'recordlyFocused' : 'recordlyCinematic') }}</Button
      >
    </ButtonGroup>
    <div class="advanced-action">
      <AdvancedButton
        :open="advanced"
        controls="recordly-zoom-advanced"
        :label="t('advanced')"
        @update:open="advanced = $event"
      />
    </div>
    <RafRevealTransition>
      <div v-if="advanced" id="recordly-zoom-advanced" class="advanced-fields">
        <div class="toggle">
          <span>{{ t('recordlyClassic') }}</span
          ><Switch
            :model-value="settings.zoomClassicMode"
            :aria-label="t('recordlyClassic')"
            @update:model-value="update({ zoomClassicMode: $event })"
          />
        </div>
        <div class="toggle">
          <span>{{ t('recordlyConnect') }}</span
          ><Switch
            :model-value="settings.connectZooms"
            :aria-label="t('recordlyConnect')"
            @update:model-value="update({ connectZooms: $event })"
          />
        </div>
        <template v-if="settings.connectZooms">
          <BigSlider
            :model-value="settings.connectedZoomGapMs"
            :min="0"
            :max="5000"
            :step="1"
            :default-value="1500"
            :label="t('recordlyGap')"
            :format-value="(value) => `${Math.round(value)} ms`"
            @update:model-value="update({ connectedZoomGapMs: $event })"
          />
          <BigSlider
            :model-value="settings.connectedZoomDurationMs"
            :min="60"
            :max="4000"
            :step="1"
            :default-value="1000"
            :label="t('recordlyPan')"
            :format-value="(value) => `${Math.round(value)} ms`"
            @update:model-value="update({ connectedZoomDurationMs: $event })"
          />
        </template>
        <BigSlider
          v-for="control in RECORDLY_CONTROLS"
          :key="control.key"
          :model-value="settings[control.key]"
          :min="control.min"
          :max="control.max"
          :step="control.step"
          :default-value="normalizeRecordlyZoom(undefined)[control.key]"
          :label="t(control.label)"
          :format-value="(value) => `${Number(value.toFixed(2))}${control.unit ? ` ${control.unit}` : ''}`"
          @update:model-value="update({ [control.key]: $event })"
        />
      </div>
    </RafRevealTransition>
  </div>
</template>
<style scoped>
.recordly-settings,
.advanced-fields {
  display: grid;
  gap: 12px;
}
.advanced-action {
  display: flex;
  justify-content: flex-end;
}
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
</style>
