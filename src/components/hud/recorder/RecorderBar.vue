<script setup lang="ts">
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
} from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";
import Tooltip from "~/ui/tooltip/Tooltip.vue";
import KeyboardChip from "~/ui/KeyboardChip.vue";
import { usePreferencesStore } from "~/stores/preferences";
import type { RecordingPhase } from "./recording-types";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("RecorderBar");

defineProps<{
  phase: RecordingPhase;
  secondsRemaining: number;
  recordingTime: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
  visibility: "always" | "auto-fade";
}>();

const emit = defineEmits<{
  stop: [];
  pause: [];
  camera: [];
  microphone: [];
  systemAudio: [];
}>();

const preferencesStore = usePreferencesStore();
let tooltipSpaceReady: Promise<void> = Promise.resolve();

onMounted(() => {
  preferencesStore.load();
  // Reserve native space before the user reaches a control. Resizing only on
  // first button hover made the bar visibly jump once per recording.
  tooltipSpaceReady = window.capture?.setRecorderTooltip(true) ?? Promise.resolve();
});

const getShortcut = (id: string, fallback: string): string => {
  return preferencesStore.settings?.shortcuts?.[id]?.keys || fallback;
};

const drag = () => window.capture?.drag();
const stopDrag = () => {
  window.removeEventListener("mousemove", drag);
  window.removeEventListener("mouseup", stopDrag);
};
const startDrag = () => {
  window.capture?.dragStart();
  window.addEventListener("mousemove", drag);
  window.addEventListener("mouseup", stopDrag, { once: true });
};
const tooltipsReady = ref(false);
const showTooltips = async () => {
  tooltipsReady.value = false;
  await tooltipSpaceReady;
  tooltipsReady.value = true;
};
const hideTooltips = () => {
  tooltipsReady.value = false;
};
onBeforeUnmount(() => {
  stopDrag();
  void window.capture?.setRecorderTooltip(false);
});
</script>

<template>
  <aside
    class="recorder-bar"
    :class="{ 'auto-fade': visibility === 'auto-fade' }"
    :aria-label="t('recordingControls')"
    @mousedown="startDrag"
    @mouseenter="showTooltips"
    @mouseleave="hideTooltips"
  >
    <p
      class="recording-time"
      :class="{ countdown: phase === 'countdown' }"
      aria-live="polite"
    >
      {{ phase === "countdown" ? t('ready') : recordingTime }}
    </p>

    <!-- Play/Pause -->
    <Tooltip position="left" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ phase === 'paused' ? t('resumeRecording') : t('pauseRecording') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.playPause', 'Alt+Shift+P')" size="sm" />
        </div>
      </template>
      <button
        class="control"
        :aria-label="
          phase === 'paused' ? t('resumeRecording') : t('pauseRecording')
        "
        :disabled="phase === 'countdown'"
        @mousedown.stop
        @click="emit('pause')"
      >
        <Play v-if="phase === 'paused'" /><Pause v-else />
      </button>
    </Tooltip>

    <!-- Stop -->
    <Tooltip position="left" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ t('stopRecording') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.startStopRecording', 'Alt+Shift+R')" size="sm" />
        </div>
      </template>
      <button
        class="control stop"
        :aria-label="t('stopRecording')"
        @mousedown.stop
        @click="emit('stop')"
      >
        <Square />
      </button>
    </Tooltip>

    <!-- Mic -->
    <Tooltip position="left" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ microphoneEnabled ? t('turnMicOff') : t('turnMicOn') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.toggleMic', 'Alt+Shift+M')" size="sm" />
        </div>
      </template>
      <button
        class="control"
        :aria-label="
          microphoneEnabled ? t('turnMicOff') : t('turnMicOn')
        "
        :disabled="phase === 'countdown'"
        @mousedown.stop
        @click="emit('microphone')"
      >
        <Mic v-if="microphoneEnabled" /><MicOff v-else />
      </button>
    </Tooltip>

    <!-- Camera -->
    <Tooltip position="left" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ cameraEnabled ? t('turnCameraOff') : t('turnCameraOn') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.toggleCamera', 'Alt+Shift+C')" size="sm" />
        </div>
      </template>
      <button
        class="control"
        :aria-label="cameraEnabled ? t('turnCameraOff') : t('turnCameraOn')"
        :disabled="phase === 'countdown'"
        @mousedown.stop
        @click="emit('camera')"
      >
        <Camera v-if="cameraEnabled" /><CameraOff v-else />
      </button>
    </Tooltip>

    <!-- System Audio -->
    <Tooltip position="left" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ systemAudioEnabled ? t('turnSystemAudioOff') : t('turnSystemAudioOn') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.toggleSystemAudio', 'Alt+Shift+A')" size="sm" />
        </div>
      </template>
      <button
        class="control"
        :aria-label="
          systemAudioEnabled ? t('turnSystemAudioOff') : t('turnSystemAudioOn')
        "
        :disabled="phase === 'countdown'"
        @mousedown.stop
        @click="emit('systemAudio')"
      >
        <Volume2 v-if="systemAudioEnabled" /><VolumeX v-else />
      </button>
    </Tooltip>
  </aside>
</template>

<style scoped>
.recorder-bar {
  position: fixed;
  top: 0;
  right: 0;
  width: 72px;
  box-sizing: border-box;
  min-height: 296px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  -webkit-app-region: drag;
  transition: opacity 0.18s ease;
}
.recorder-bar.auto-fade {
  opacity: 0.15;
}
.recorder-bar.auto-fade:hover,
.recorder-bar.auto-fade:focus-within {
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
.tooltip-shortcut-content {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
