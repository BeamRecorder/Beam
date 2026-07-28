<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Captions,
  GripVertical,
  Image as ImageIcon,
  Mic,
  MousePointer,
  Type,
  Video,
  Volume2,
} from "@lucide/vue";
import type { ExportProgress } from "../../export/export-types";
import type { ZoomElement } from "../zoom/zoom-types";
import type { Clip, ClipComposition } from "../composition/composition-types";
import { isAudioClip, isVisualClip } from "../composition/composition-types";
import TimelineClip from "./TimelineClip.vue";

const props = defineProps<{
  currentTime: number;
  duration: number;
  zoomLevel: number;
  exportProgress?: ExportProgress | null;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
  composition: ClipComposition;
  selectedClipId: string | null;
}>();
const emit = defineEmits<{
  (event: "update:currentTime", value: number): void;
  (event: "update:zoomLevel", value: number): void;
  (event: "select:zoom", zoomId: string): void;
  (event: "select:clip", clipId: string): void;
  (event: "toggle:clip", clipId: string): void;
  (event: "trim:clip", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (event: "move:clip", payload: { id: string; startMs: number }): void;
  (event: "trim:zoom", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (event: "move:zoom", payload: { id: string; startMs: number; endMs: number }): void;
  (event: "add:zoom", timeMs: number): void;
  (event: "add:caption", timeMs: number): void;
  (event: "reorder:clip", payload: { id: string; targetIndex: number }): void;
}>();

const ticksAreaRef = ref<HTMLDivElement | null>(null);
const tracksScrollRef = ref<HTMLDivElement | null>(null);
const tracksWidthStyle = computed(() => ({
  width: `calc(${props.zoomLevel}% + 230px)`,
  minWidth: "calc(100% + 230px)",
}));
const durationMs = computed(() => Math.max(1, Math.round(props.duration * 1_000)));
const rulerStep = computed(() => props.duration > 900 ? 30 : props.duration > 300 ? 10 : 5);
const rulerSeconds = computed(() => {
  const values: number[] = [];
  for (let second = 0; second <= Math.ceil(props.duration); second += rulerStep.value) values.push(second);
  return values;
});
const visibleSeconds = computed(() => Array.from({ length: Math.ceil(props.duration) + 1 }, (_, second) => second));
const playheadStyle = computed(() => ({ left: `${props.duration > 0 ? props.currentTime / props.duration * 100 : 0}%` }));
const percentageStyle = (startMs: number, lengthMs: number) => ({
  left: `${startMs / durationMs.value * 100}%`,
  width: `${lengthMs / durationMs.value * 100}%`,
});
const orderedClips = computed(() => [...props.composition.clips].sort((left, right) => left.order - right.order));
const assetFor = (clip: Clip) => clip.kind === "caption" ? null : props.composition.assets.find((asset) => asset.id === clip.assetId) ?? null;
const iconFor = (clip: Clip) => {
  if (clip.kind === "caption") return Type;
  if (clip.kind === "audio") return clip.role === "microphone" ? Mic : Volume2;
  if (clip.kind === "image") return ImageIcon;
  if (clip.kind === "webcam") return Captions;
  return Video;
};
const kindLabel = (clip: Clip) => {
  if (clip.kind === "screen") return "VIDEO";
  if (clip.kind === "webcam") return "WEBCAM";
  if (clip.kind === "audio") return clip.role === "microphone" ? "MICROPHONE" : clip.role === "system" ? "SYSTEM" : "AUDIO";
  return clip.kind.toUpperCase();
};

const scrubAt = (clientX: number) => {
  const target = ticksAreaRef.value;
  if (!target || props.duration <= 0) return;
  const rect = target.getBoundingClientRect();
  const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
  emit("update:currentTime", percentage * props.duration);
};
const beginScrub = (event: PointerEvent) => {
  scrubAt(event.clientX);
  const move = (next: PointerEvent) => scrubAt(next.clientX);
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
};
const timeAt = (clientX: number) => {
  const target = ticksAreaRef.value;
  if (!target) return 0;
  const rect = target.getBoundingClientRect();
  return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))) * durationMs.value);
};

const beginClipMove = (event: PointerEvent, clip: Clip) => {
  if ((event.target as HTMLElement).closest(".trim-handle")) return;
  const startPointerMs = timeAt(event.clientX);
  const originalStartMs = clip.timelineStartMs;
  const end = (next: PointerEvent) => {
    const delta = timeAt(next.clientX) - startPointerMs;
    emit("move:clip", { id: clip.id, startMs: Math.max(0, originalStartMs + delta) });
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointerup", end);
};
const beginClipTrim = (payload: { event: PointerEvent; edge: "start" | "end" }, clip: Clip) => {
  payload.event.preventDefault();
  payload.event.stopPropagation();
  const end = (next: PointerEvent) => {
    const minimum = clip.timelineStartMs + 40;
    const maximum = clip.timelineStartMs + clip.timelineDurationMs - 40;
    const timeMs = Math.max(minimum, Math.min(maximum, timeAt(next.clientX)));
    emit("trim:clip", { id: clip.id, edge: payload.edge, timeMs });
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointerup", end);
};
const beginZoomMove = (event: PointerEvent, zoom: ZoomElement) => {
  if ((event.target as HTMLElement).closest(".trim-handle")) return;
  const startPointerMs = timeAt(event.clientX);
  const originalStart = zoom.startMs;
  const length = zoom.endMs - zoom.startMs;
  const end = (next: PointerEvent) => {
    const startMs = Math.max(0, originalStart + timeAt(next.clientX) - startPointerMs);
    emit("move:zoom", { id: zoom.id, startMs, endMs: startMs + length });
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointerup", end);
};
const beginZoomTrim = (event: PointerEvent, zoom: ZoomElement, edge: "start" | "end") => {
  event.stopPropagation();
  const end = (next: PointerEvent) => {
    const timeMs = Math.max(zoom.startMs + 40, Math.min(zoom.endMs - 40, timeAt(next.clientX)));
    emit("trim:zoom", { id: zoom.id, edge, timeMs });
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointerup", end);
};
const addAt = (event: MouseEvent, kind: "zoom" | "caption") => {
  const timeMs = timeAt(event.clientX);
  emit(kind === "zoom" ? "add:zoom" : "add:caption", timeMs);
};
const handleWheel = (event: WheelEvent) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  emit("update:zoomLevel", Math.max(100, Math.min(500, props.zoomLevel + (event.deltaY < 0 ? 15 : -15))));
};

const draggedClipId = ref<string | null>(null);
const visualClips = computed(() => orderedClips.value.filter(isVisualClip));
const beginReorder = (event: DragEvent, clipId: string) => {
  draggedClipId.value = clipId;
  event.dataTransfer?.setData("text/plain", clipId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
};
const finishReorder = (event: DragEvent, targetId: string) => {
  const id = event.dataTransfer?.getData("text/plain") || draggedClipId.value;
  const targetIndex = visualClips.value.findIndex((clip) => clip.id === targetId);
  if (id && targetIndex >= 0) emit("reorder:clip", { id, targetIndex });
  draggedClipId.value = null;
};
</script>

<template>
  <div ref="tracksScrollRef" class="timeline-tracks-container" @wheel="handleWheel">
    <div class="timeline-viewport" :style="tracksWidthStyle">
      <div class="timeline-ruler">
        <div class="ruler-info-spacer"></div>
        <div ref="ticksAreaRef" class="ruler-ticks-area" @pointerdown="beginScrub">
          <div v-if="exportProgress && exportProgress.totalTimeMs" class="ruler-export-progress-bar" :style="{ width: `${Math.min(100, exportProgress.currentTimeMs! / exportProgress.totalTimeMs! * 100)}%` }" />
          <div v-for="second in rulerSeconds" :key="second" class="ruler-marker" :style="{ left: `${second / Math.max(1, duration) * 100}%` }">
            <span class="marker-label">{{ second }}s</span><span class="marker-tick" />
          </div>
          <div class="timeline-playhead" :style="playheadStyle"><div class="playhead-knob" /></div>
        </div>
      </div>

      <div class="tracks-stack">
        <div v-for="clip in orderedClips" :key="clip.id" class="track-row" :class="{ disabled: !clip.enabled }" @dragover.prevent @drop.prevent="finishReorder($event, clip.id)">
          <button type="button" class="track-info" @click="emit('toggle:clip', clip.id)">
            <span v-if="isVisualClip(clip)" class="track-drag-handle" draggable="true" @click.stop @dragstart.stop="beginReorder($event, clip.id)" @dragend="draggedClipId = null"><GripVertical class="track-grip" /></span>
            <component :is="iconFor(clip)" class="track-icon" />
            <span class="track-title"><small>{{ kindLabel(clip) }}</small>{{ clip.name }}</span>
          </button>
          <div class="track-content">
            <TimelineClip
              :clip="clip"
              :asset="assetFor(clip)"
              :duration="duration"
              :visible-seconds="visibleSeconds"
              :selected="selectedClipId === clip.id"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event, clip)"
            />
          </div>
        </div>

        <div class="track-row zoom-track">
          <button type="button" class="track-info" @dblclick="addAt($event, 'zoom')"><MousePointer class="track-icon" /><span class="track-title">ZOOMS</span></button>
          <div class="track-content" @dblclick="addAt($event, 'zoom')">
            <button
              v-for="zoom in zoomElements"
              :key="zoom.id"
              type="button"
              class="zoom-clip"
              :class="{ selected: selectedZoomId === zoom.id }"
              :style="percentageStyle(zoom.startMs, zoom.endMs - zoom.startMs)"
              @click.stop="emit('select:zoom', zoom.id)"
              @pointerdown="beginZoomMove($event, zoom)"
            >
              <span class="trim-handle start" @pointerdown.stop="beginZoomTrim($event, zoom, 'start')" />
              {{ zoom.depth.toFixed(0) }}×
              <span class="trim-handle end" @pointerdown.stop="beginZoomTrim($event, zoom, 'end')" />
            </button>
          </div>
        </div>

        <div class="track-row caption-add-track">
          <button type="button" class="track-info" @dblclick="addAt($event, 'caption')"><Type class="track-icon" /><span class="track-title">CAPTIONS</span></button>
          <div class="track-content add-hint" @dblclick="addAt($event, 'caption')">Double-click to add a caption</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-tracks-container { width: 100%; min-height: 190px; max-height: 330px; overflow: auto; background: var(--color-bg-element); }
.timeline-viewport { position: relative; }
.timeline-ruler { position: sticky; top: 0; z-index: 20; display: grid; grid-template-columns: 230px 1fr; height: 30px; background: var(--color-bg-element); border-bottom: 1px solid var(--color-border); }
.ruler-info-spacer { border-right: 1px solid var(--color-border); }
.ruler-ticks-area { position: relative; cursor: ew-resize; overflow: visible; }
.ruler-marker { position: absolute; inset-block: 0; border-left: 1px solid var(--color-border); pointer-events: none; }
.marker-label { position: absolute; left: 5px; top: 4px; font-size: 9px; color: var(--text-muted); }.marker-tick { display: block; height: 5px; }
.ruler-export-progress-bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--color-primary); }
.timeline-playhead { position: absolute; top: 0; bottom: -1000px; width: 1px; background: var(--color-primary); z-index: 40; pointer-events: none; }
.playhead-knob { position: absolute; top: 0; left: 50%; width: 10px; height: 10px; transform: translate(-50%, -2px); border-radius: 50%; background: var(--color-primary); }
.tracks-stack { position: relative; }
.track-row { display: grid; grid-template-columns: 230px 1fr; min-height: 48px; border-bottom: 1px solid var(--color-border); }
.track-row.disabled { opacity: .55; }
.track-info { display: flex; align-items: center; gap: 8px; padding: 0 10px; overflow: hidden; border: 0; border-right: 1px solid var(--color-border); background: var(--color-bg-element); color: var(--text-secondary); text-align: left; cursor: pointer; }
.track-info:hover { background: var(--color-bg-surface); }.track-icon { width: 15px; height: 15px; flex: none; }.track-grip { width: 13px; height: 13px; }.track-drag-handle { display: inline-flex; cursor: grab; color: var(--text-muted); }
.track-title { min-width: 0; display: flex; flex-direction: column; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11px; font-weight: 700; }.track-title small { font-size: 8px; color: var(--text-muted); letter-spacing: .06em; }
.track-content { position: relative; min-width: 0; min-height: 48px; background-image: linear-gradient(to right, color-mix(in srgb, var(--color-border) 45%, transparent) 1px, transparent 1px); background-size: 1% 100%; }
.zoom-clip { position: absolute; inset-block: 8px; min-width: 12px; border: 1px solid color-mix(in srgb, var(--color-primary) 70%, transparent); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-primary) 20%, var(--color-bg-surface)); color: var(--text-primary); font-size: 9px; font-weight: 800; cursor: grab; }.zoom-clip.selected { box-shadow: inset 0 0 0 1px var(--color-primary); }
.trim-handle { position: absolute; top: 0; bottom: 0; width: 6px; cursor: col-resize; }.trim-handle.start { left: 0; }.trim-handle.end { right: 0; }
.add-hint { display: flex; align-items: center; padding-left: 12px; color: var(--text-muted); font-size: 10px; user-select: none; }
</style>
