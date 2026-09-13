<script setup lang="ts">
import { computed } from 'vue';
import { Mic, Timer, Volume2, VolumeX } from '@lucide/vue';
import VoiceoverControlBar from './VoiceoverControlBar.vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { VoiceoverRecorderState } from './voiceover-types';

const props = defineProps<{ state: VoiceoverRecorderState }>();
const emit = defineEmits<{
  start: [];
  pause: [];
  resume: [];
  stop: [];
  discard: [];
  'select-microphone': [value: string];
  'update-countdown': [value: number];
  'toggle-monitoring': [];
}>();
const { t } = useTranslate('VoiceoverRecorder');
const microphoneOptions = computed(() =>
  props.state.microphones.map((microphone) => ({ value: microphone.id, label: microphone.label })),
);
const countdownOptions = computed(() =>
  [0, 3, 5, 10].map((seconds) => ({ value: seconds, label: seconds === 0 ? t('countdownOff') : `${seconds}s` })),
);
const settingsLocked = computed(() => !['idle', 'error'].includes(props.state.phase));
</script>

<template>
  <VoiceoverControlBar
    :phase="state.phase"
    :elapsed-label="state.elapsedLabel"
    :countdown-remaining="state.countdownRemaining"
    :waveform-bars="state.previewBars"
    :start-label="t('record')"
    :pause-label="t('pause')"
    :resume-label="t('resume')"
    :stop-label="t('stop')"
    :discard-label="t('discard')"
    :preparing-label="state.phase === 'finalizing' ? t('finalizing') : t('preparing')"
    :can-start="Boolean(state.selectedMicrophoneId) && state.phase === 'idle'"
    @start="emit('start')"
    @pause="emit('pause')"
    @resume="emit('resume')"
    @stop="emit('stop')"
    @discard="emit('discard')"
  >
    <template #settings>
      <Select
        class="microphone-select"
        :model-value="state.selectedMicrophoneId"
        :options="microphoneOptions"
        :placeholder="t('microphone')"
        :icon="Mic"
        :disabled="settingsLocked"
        size="sm"
        direction="up"
        @update:model-value="emit('select-microphone', String($event))"
      />
      <Select
        class="countdown-select"
        :model-value="state.countdownSeconds"
        :options="countdownOptions"
        :icon="Timer"
        :disabled="settingsLocked"
        size="sm"
        direction="up"
        @update:model-value="emit('update-countdown', Number($event))"
      />
      <Button
        variant="ghost"
        size="sm"
        :icon="state.monitorProjectAudio ? Volume2 : VolumeX"
        :tooltip="state.monitorProjectAudio ? t('muteProjectAudio') : t('monitorProjectAudio')"
        icon-only
        @click="emit('toggle-monitoring')"
      />
    </template>
    <template #status>
      <span v-if="state.error" class="voiceover-error" role="alert">{{ state.error }}</span>
    </template>
  </VoiceoverControlBar>
</template>

<style scoped>
.microphone-select {
  width: 180px;
}
.countdown-select {
  width: 76px;
}
.voiceover-error {
  max-width: 220px;
  overflow: hidden;
  color: var(--color-error);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
