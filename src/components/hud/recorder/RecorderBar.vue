<script setup lang="ts">
import { Video, VideoOff, GripVertical, Pause, Play, Square, Trash2 } from '@lucide/vue';
import { computed } from 'vue';
import type { RecordingBarVisibility, RecordingPhase } from './recording-types';
import { useTranslate } from '~/i18n/useTranslate';
import { useAudioLevelMeter } from '../audio/useAudioLevelMeter';
import AudioIconMeter from '../audio/AudioIconMeter.vue';

const { t } = useTranslate('RecorderBar');

const props = defineProps<{
  phase: RecordingPhase;
  secondsRemaining: number;
  recordingTime: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
  visibility: RecordingBarVisibility;
  hoverOnlyActive?: boolean;
}>();

const isMicEnabled = computed(() => props.microphoneEnabled && props.phase !== 'finalizing');
const isSystemAudioEnabled = computed(() => props.systemAudioEnabled && props.phase !== 'finalizing');
const { level: micLevel } = useAudioLevelMeter(isMicEnabled, undefined, false);
const { level: systemAudioLevel } = useAudioLevelMeter(isSystemAudioEnabled, undefined, true);

const emit = defineEmits<{
  stop: [];
  cancel: [];
  pause: [];
  camera: [];
  microphone: [];
  systemAudio: [];
}>();
</script>

<template>
  <aside
    class="recorder-bar"
    :class="{
      'auto-fade': visibility === 'auto-fade',
      'hover-only': visibility === 'hover-only' && hoverOnlyActive,
    }"
    :aria-label="t('recordingControls')"
  >
    <button class="drag-handle" type="button" :aria-label="t('moveRecorderBar')" :title="t('moveRecorderBar')">
      <GripVertical aria-hidden="true" />
    </button>

    <p class="recording-time" :class="{ countdown: phase === 'countdown' }" aria-live="polite">
      {{ phase === 'countdown' ? t('ready') : recordingTime }}
    </p>

    <button
      class="control"
      :aria-label="phase === 'paused' ? t('resumeRecording') : t('pauseRecording')"
      :title="phase === 'paused' ? t('resumeRecording') : t('pauseRecording')"
      :disabled="phase === 'countdown' || phase === 'finalizing'"
      @pointerdown.stop
      @click="emit('pause')"
    >
      <Play v-if="phase === 'paused'" /><Pause v-else />
    </button>

    <button
      class="control stop"
      :aria-label="t('stopRecording')"
      :title="t('stopRecording')"
      :disabled="phase === 'finalizing'"
      @pointerdown.stop
      @click="emit('stop')"
    >
      <Square />
    </button>

    <button
      class="control"
      :class="{ inactive: !microphoneEnabled }"
      :aria-label="microphoneEnabled ? t('turnMicOff') : t('turnMicOn')"
      :title="microphoneEnabled ? t('turnMicOff') : t('turnMicOn')"
      :disabled="phase === 'countdown' || phase === 'finalizing'"
      @pointerdown.stop
      @click="emit('microphone')"
    >
      <AudioIconMeter kind="mic" :enabled="microphoneEnabled" :level="micLevel" size="sm" />
    </button>

    <button
      class="control"
      :class="{ inactive: !cameraEnabled }"
      :aria-label="cameraEnabled ? t('turnCameraOff') : t('turnCameraOn')"
      :title="cameraEnabled ? t('turnCameraOff') : t('turnCameraOn')"
      :disabled="phase === 'countdown' || phase === 'finalizing'"
      @pointerdown.stop
      @click="emit('camera')"
    >
      <Video v-if="cameraEnabled" /><VideoOff v-else />
    </button>

    <button
      class="control"
      :class="{ inactive: !systemAudioEnabled }"
      :aria-label="systemAudioEnabled ? t('turnSystemAudioOff') : t('turnSystemAudioOn')"
      :title="systemAudioEnabled ? t('turnSystemAudioOff') : t('turnSystemAudioOn')"
      :disabled="phase === 'countdown' || phase === 'finalizing'"
      @pointerdown.stop
      @click="emit('systemAudio')"
    >
      <AudioIconMeter kind="system" :enabled="systemAudioEnabled" :level="systemAudioLevel" size="sm" />
    </button>

    <div class="cancel-slot">
      <button
        class="control cancel"
        :aria-label="t('cancelRecording')"
        :title="t('cancelRecording')"
        :disabled="phase === 'finalizing'"
        @pointerdown.stop
        @click="emit('cancel')"
      >
        <Trash2 />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.recorder-bar {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 999999;
  pointer-events: auto;
  width: 72px;
  box-sizing: border-box;
  min-height: 344px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  -webkit-app-region: drag;
  cursor: grab;
  transition: opacity 0.18s ease;
}
.drag-handle {
  width: 40px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  cursor: grab;
  -webkit-app-region: drag;
}
.drag-handle:hover,
.drag-handle:focus-visible {
  background: var(--color-bg-element);
  color: var(--text-primary);
  outline: none;
}
.drag-handle :deep(svg) {
  width: 18px;
  height: 18px;
}
.recorder-bar.auto-fade {
  opacity: 0.15;
}
.recorder-bar.auto-fade:hover,
.recorder-bar.auto-fade:focus-within {
  opacity: 1;
}
.recorder-bar.hover-only {
  opacity: 0;
}
.recorder-bar.hover-only:hover,
.recorder-bar.hover-only:focus-within {
  opacity: 1;
}
.control {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.control:hover:not(:disabled) {
  background: var(--color-bg-element);
}
.control:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.control.stop {
  color: var(--color-error);
}
.control.inactive {
  color: var(--color-error);
}
.cancel-slot {
  margin-top: -4px;
}
.control.cancel {
  color: var(--color-error);
}
.control :deep(svg) {
  width: 20px;
  height: 20px;
}
.recording-time {
  margin: 0;
  font-size: 11px;
  line-height: 24px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.countdown {
  color: var(--text-muted);
}
</style>
