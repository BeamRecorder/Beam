<script setup lang="ts">
import {
  Video,
  VideoOff,
  GripVertical,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Tooltip from "~/ui/tooltip/Tooltip.vue";
import KeyboardChip from "~/ui/KeyboardChip.vue";
import { usePreferencesStore } from "~/stores/preferences";
import type { RecordingPhase } from "./recording-types";
import { useTranslate } from "~/i18n/useTranslate";
import { useAudioLevelMeter } from "../audio/useAudioLevelMeter";
import AudioIconMeter from "../audio/AudioIconMeter.vue";

const { t } = useTranslate("RecorderBar");

const props = defineProps<{
  phase: RecordingPhase;
  secondsRemaining: number;
  recordingTime: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
  visibility: "always" | "auto-fade";
}>();

const isMicEnabled = computed(() => props.microphoneEnabled);
const isSystemAudioEnabled = computed(() => props.systemAudioEnabled);
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

const preferencesStore = usePreferencesStore();
let tooltipSpaceReady: Promise<void> = Promise.resolve();
const tooltipSide = ref<'left' | 'right'>('left');
const tooltipPosition = computed(() => tooltipSide.value);
let stopTooltipSideListener: (() => void) | undefined;

const applyTooltipSide = (side: unknown, source: string) => {
  console.info('[RecorderBar] tooltip side', { source, previous: tooltipSide.value, side });
  if (side === 'left' || side === 'right') tooltipSide.value = side;
};

onMounted(() => {
  preferencesStore.load();
  stopTooltipSideListener = window.capture?.onRecorderTooltipSide((side) => applyTooltipSide(side, 'nativeMove'));
  // Reserve native space before the user reaches a control. Resizing only on
  // first button hover made the bar visibly jump once per recording.
  tooltipSpaceReady = (async () => {
    const initialSide = await window.capture?.getRecorderTooltipSide();
    applyTooltipSide(initialSide, 'before-expand');
    await nextTick();
    const side = await window.capture?.setRecorderTooltip(true);
    applyTooltipSide(side, 'mount');
  })();
});

const getShortcut = (id: string, fallback: string): string => {
  return preferencesStore.settings?.shortcuts?.[id]?.keys || fallback;
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
  stopTooltipSideListener?.();
  void window.capture?.setRecorderTooltip(false);
});
</script>

<template>
  <aside
    class="recorder-bar"
    :class="{ 'auto-fade': visibility === 'auto-fade', 'tooltip-right': tooltipSide === 'right' }"
    :aria-label="t('recordingControls')"
    @mouseenter="showTooltips"
    @mouseleave="hideTooltips"
  >
    <button
      class="drag-handle"
      type="button"
      :aria-label="t('moveRecorderBar')"
      :title="t('moveRecorderBar')"
    >
      <GripVertical aria-hidden="true" />
    </button>

    <p
      class="recording-time"
      :class="{ countdown: phase === 'countdown' }"
      aria-live="polite"
    >
      {{ phase === "countdown" ? t('ready') : recordingTime }}
    </p>

    <!-- Play/Pause -->
    <Tooltip :position="tooltipPosition" :max-width="220" :disabled="!tooltipsReady">
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
        @pointerdown.stop
        @click="emit('pause')"
      >
        <Play v-if="phase === 'paused'" /><Pause v-else />
      </button>
    </Tooltip>

    <!-- Stop -->
    <Tooltip :position="tooltipPosition" :max-width="220" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ t('stopRecording') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.startStopRecording', 'Alt+Shift+R')" size="sm" />
        </div>
      </template>
      <button
        class="control stop"
        :aria-label="t('stopRecording')"
        @pointerdown.stop
        @click="emit('stop')"
      >
        <Square />
      </button>
    </Tooltip>

    <!-- Mic -->
    <Tooltip :position="tooltipPosition" :max-width="220" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ microphoneEnabled ? t('turnMicOff') : t('turnMicOn') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.toggleMic', 'Alt+Shift+M')" size="sm" />
        </div>
      </template>
      <button
        class="control"
        :class="{ inactive: !microphoneEnabled }"
        :aria-label="
          microphoneEnabled ? t('turnMicOff') : t('turnMicOn')
        "
        :disabled="phase === 'countdown'"
        @pointerdown.stop
        @click="emit('microphone')"
      >
        <AudioIconMeter
          kind="mic"
          :enabled="microphoneEnabled"
          :level="micLevel"
          size="sm"
        />
      </button>
    </Tooltip>

    <!-- Camera -->
    <Tooltip :position="tooltipPosition" :max-width="220" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ cameraEnabled ? t('turnCameraOff') : t('turnCameraOn') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.toggleCamera', 'Alt+Shift+C')" size="sm" />
        </div>
      </template>
      <button
        class="control"
        :class="{ inactive: !cameraEnabled }"
        :aria-label="cameraEnabled ? t('turnCameraOff') : t('turnCameraOn')"
        :disabled="phase === 'countdown'"
        @pointerdown.stop
        @click="emit('camera')"
      >
        <Video v-if="cameraEnabled" /><VideoOff v-else />
      </button>
    </Tooltip>

    <!-- System Audio -->
    <Tooltip :position="tooltipPosition" :max-width="220" :disabled="!tooltipsReady">
      <template #content>
        <div class="tooltip-shortcut-content">
          <span>{{ systemAudioEnabled ? t('turnSystemAudioOff') : t('turnSystemAudioOn') }}</span>
          <KeyboardChip :shortcut="getShortcut('hud.toggleSystemAudio', 'Alt+Shift+A')" size="sm" />
        </div>
      </template>
      <button
        class="control"
        :class="{ inactive: !systemAudioEnabled }"
        :aria-label="
          systemAudioEnabled ? t('turnSystemAudioOff') : t('turnSystemAudioOn')
        "
        :disabled="phase === 'countdown'"
        @pointerdown.stop
        @click="emit('systemAudio')"
      >
        <AudioIconMeter
          kind="system"
          :enabled="systemAudioEnabled"
          :level="systemAudioLevel"
          size="sm"
        />
      </button>
    </Tooltip>

    <div class="cancel-slot">
      <Tooltip :position="tooltipPosition" :max-width="220" :disabled="!tooltipsReady">
        <template #content>
          <span>{{ t('cancelRecording') }}</span>
        </template>
        <button
          class="control cancel"
          :aria-label="t('cancelRecording')"
          :disabled="phase === 'finalizing'"
          @pointerdown.stop
          @click="emit('cancel')"
        >
          <Trash2 />
        </button>
      </Tooltip>
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
.recorder-bar.tooltip-right {
  left: 0;
  right: auto;
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
.tooltip-shortcut-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  max-width: 198px;
  min-width: 0;
  line-height: 1.35;
}
.tooltip-shortcut-content > span {
  min-width: 0;
  overflow-wrap: normal;
  word-break: normal;
}
</style>
