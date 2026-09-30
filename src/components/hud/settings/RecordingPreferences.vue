<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import Select from '~/ui/select/Select.vue';
import Switch from '~/ui/switch/Switch.vue';
import RecordingWindowPreview from './RecordingWindowPreview.vue';
import type { RecordingBarVisibility } from '../recorder/recording-types';

withDefaults(
  defineProps<{ countdownSeconds: number; recordingBarVisibility?: RecordingBarVisibility; alwaysOnTop?: boolean }>(),
  {
    recordingBarVisibility: 'always',
    alwaysOnTop: true,
  },
);
const emit = defineEmits<{
  'update:countdownSeconds': [number];
  'update:alwaysOnTop': [boolean];
  'update:recordingBarVisibility': [RecordingBarVisibility];
}>();
const { t } = useTranslate('HudPreferences');
const countdownOptions = computed(() =>
  Array.from({ length: 11 }, (_, seconds) => ({ value: seconds, label: seconds === 0 ? t('off') : `${seconds}s` })),
);
const recordingBarOptions = computed(() => [
  { value: 'always', label: t('alwaysVisible') },
  { value: 'auto-fade', label: t('autoFade') },
  { value: 'hover-only', label: t('hiddenUntilHovered') },
]);
const updateRecordingBarVisibility = (value: string | number) => {
  if (value === 'always' || value === 'auto-fade' || value === 'hover-only')
    emit('update:recordingBarVisibility', value);
};
const updateCountdownSeconds = (value: string | number) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10)
    emit('update:countdownSeconds', value);
};
</script>

<template>
  <div class="preference-stack">
    <div class="preference-item preview-preference" data-setting="always-on-top" tabindex="-1">
      <RecordingWindowPreview kind="window" />
      <div class="preview-control-row">
        <div class="preference-copy">
          <p class="preference-title">{{ t('alwaysOnTop') }}</p>
          <p class="preference-description">{{ t('recorderAlwaysOnTopDesc') }}</p>
        </div>
        <Switch
          :model-value="alwaysOnTop"
          :aria-label="t('alwaysOnTop')"
          @update:model-value="emit('update:alwaysOnTop', $event)"
        />
      </div>
    </div>
    <div class="preference-item preview-preference" data-setting="recorder-bar" tabindex="-1">
      <RecordingWindowPreview kind="bar" :visibility="recordingBarVisibility" />
      <div class="preview-control-row">
        <div class="preference-copy">
          <p class="preference-title">{{ t('recorderBar') }}</p>
          <p class="preference-description">{{ t('visibilityWhileRecording') }}</p>
        </div>
        <div class="recorder-bar-select preference-control">
          <Select
            :model-value="recordingBarVisibility"
            :options="recordingBarOptions"
            size="sm"
            :aria-label="t('recorderBar')"
            @update:model-value="updateRecordingBarVisibility"
          />
        </div>
      </div>
    </div>
    <div class="preference-item" data-setting="countdown" tabindex="-1">
      <div class="preference-copy">
        <p class="preference-title">{{ t('countdown') }}</p>
        <p class="preference-description">{{ t('selectDelay') }}</p>
      </div>
      <div class="countdown-select preference-control">
        <Select
          :model-value="countdownSeconds"
          :options="countdownOptions"
          size="sm"
          :aria-label="t('countdown')"
          @update:model-value="updateCountdownSeconds"
        />
      </div>
    </div>
  </div>
</template>

<style scoped src="./settings-content.css"></style>
