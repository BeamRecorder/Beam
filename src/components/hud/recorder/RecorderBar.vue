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
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
  cancel: [];
  pause: [];
  camera: [];
  microphone: [];
  systemAudio: [];
}>();

const preferencesStore = usePreferencesStore();
let tooltipSpaceReady: Promise<void> = Promise.resolve();
const isDragging = ref(false);
const tooltipSide = ref<'left' | 'right'>('left');
const tooltipPosition = computed(() => tooltipSide.value);
let dragElement: HTMLElement | null = null;
let dragPointerId: number | null = null;

onMounted(() => {
  preferencesStore.load();
  // Reserve native space before the user reaches a control. Resizing only on
  // first button hover made the bar visibly jump once per recording.
  tooltipSpaceReady = (async () => {
    const side = await window.capture?.setRecorderTooltip(true);
    if (side === 'left' || side === 'right') tooltipSide.value = side;
  })();
});

const getShortcut = (id: string, fallback: string): string => {
  return preferencesStore.settings?.shortcuts?.[id]?.keys || fallback;
};

const drag = () => window.capture?.drag();
const stopDrag = () => {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener("pointermove", drag);
  window.removeEventListener("pointerup", stopDrag);
  window.removeEventListener("pointercancel", stopDrag);
  if (dragElement && dragPointerId !== null && dragElement.hasPointerCapture(dragPointerId)) dragElement.releasePointerCapture(dragPointerId);
  dragElement = null;
  dragPointerId = null;
  window.capture?.dragEnd();
};
const startDrag = (event: PointerEvent) => {
  if (event.button !== 0) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest("button, a, input, select, textarea, [role='button']") && !target?.closest(".drag-handle")) return;
  if (isDragging.value) return;
  isDragging.value = true;
  dragElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  dragPointerId = event.pointerId;
  dragElement?.setPointerCapture(event.pointerId);
  window.capture?.dragStart();
  window.addEventListener("pointermove", drag);
  window.addEventListener("pointerup", stopDrag, { once: true });
  window.addEventListener("pointercancel", stopDrag, { once: true });
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
    :class="{ 'auto-fade': visibility === 'auto-fade', dragging: isDragging, 'tooltip-right': tooltipSide === 'right' }"
    :aria-label="t('recordingControls')"
    @pointerdown="startDrag"
    @mouseenter="showTooltips"
    @mouseleave="hideTooltips"
  >
    <button
      class="drag-handle"
      type="button"
      :aria-label="t('moveRecorderBar')"
      :title="t('moveRecorderBar')"
      @pointerdown.stop="startDrag"
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
        :aria-label="
          microphoneEnabled ? t('turnMicOff') : t('turnMicOn')
        "
        :disabled="phase === 'countdown'"
        @pointerdown.stop
        @click="emit('microphone')"
      >
        <Mic v-if="microphoneEnabled" /><MicOff v-else />
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
        :aria-label="
          systemAudioEnabled ? t('turnSystemAudioOff') : t('turnSystemAudioOn')
        "
        :disabled="phase === 'countdown'"
        @pointerdown.stop
        @click="emit('systemAudio')"
      >
        <Volume2 v-if="systemAudioEnabled" /><VolumeX v-else />
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
  -webkit-app-region: no-drag;
  cursor: grab;
  transition: opacity 0.18s ease;
}
.recorder-bar.dragging {
  cursor: grabbing;
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
  -webkit-app-region: no-drag;
}
.drag-handle:hover,
.drag-handle:focus-visible {
  background: var(--color-bg-element);
  color: var(--text-primary);
  outline: none;
}
.recorder-bar.dragging .drag-handle {
  cursor: grabbing;
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
