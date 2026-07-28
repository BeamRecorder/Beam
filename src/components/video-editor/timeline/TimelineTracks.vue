<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import {
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Mic,
  MousePointer,
  MoveLeft,
  MoveRight,
  Scissors,
  Sparkles,
  Type,
  Video,
  Volume2,
} from "@lucide/vue";
import type { ExportProgress } from "../../export/export-types";
import type { AudioClip, CaptionClip, Clip, ClipComposition, VisualClip } from "../composition/composition-types";
import type { ZoomElement } from "../zoom/zoom-types";
import TimelineVideoClip from "./TimelineVideoClip.vue";
import { useTimelineTracks } from "./composables/useTimelineTracks";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("TimelineTracks");
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
  (event: "select:zoom", id: string): void;
  (event: "select:clip", id: string): void;
  (event: "toggle:clip", id: string): void;
  (event: "toggle:group", group: "screen" | "webcam" | "system" | "microphone"): void;
  (event: "add:zoom", timeMs: number): void;
  (event: "add:caption", timeMs: number): void;
  (event: "move:clip", payload: { id: string; startMs: number }): void;
  (event: "trim:clip", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (event: "move:zoom", payload: { id: string; startMs: number; endMs: number }): void;
  (event: "trim:zoom", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (event: "split:clip", id: string): void;
  (event: "reorder:clip", payload: { id: string; targetIndex: number }): void;
}>();

const state = useTimelineTracks(props, emit as never);
const {
  screenClips,
  webcamClips,
  visualClips,
  captionClips,
  systemAudioClips,
  microphoneClips,
  importedAudioClips,
  audioBars,
  assetFor,
  visualTrackIndex,
  visualTrackStyle,
  tracksScrollRef,
  tracksViewportRef,
  ticksAreaRef,
  visibleTimelineSeconds,
  visibleRulerSeconds,
  tracksWidthStyle,
  layerStyle,
  zoomElementStyle,
  rulerMarkerStyle,
  playheadStyle,
  handleMouseDown,
  handleWheel,
  onScroll,
  displayedClip,
  displayedZoom,
  trimStateFor,
  beginClipMove,
  beginClipTrim,
  beginZoomMove,
  beginZoomTrim,
  hoverZoomTimeMs,
  hoverCaptionTimeMs,
  onTrackMouseMove,
  onTrackMouseLeave,
  handleTrackClick,
} = state;

const groupEnabled = (clips: Clip[]) => clips.some((clip) => clip.enabled);
const selectedWebcam = computed(() => webcamClips.value.find((clip) => clip.id === props.selectedClipId) ?? null);
const zoomScale = (depth: number) => [1.25, 1.5, 1.8, 2.2, 3.5, 5][Math.max(0, Math.min(5, depth - 1))] ?? 1.25;
const endMs = (clip: Clip) => clip.timelineStartMs + clip.timelineDurationMs;
const audioBarHeight = (height: number, volume: number) => Math.max(1, Math.round(height * Math.max(0, Math.min(200, volume)) / 100));

const draggedClipId = ref<string | null>(null);
const beginReorder = (event: DragEvent, id: string) => {
  draggedClipId.value = id;
  event.dataTransfer?.setData("text/plain", id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
};
const finishReorder = (event: DragEvent, targetId: string) => {
  const id = event.dataTransfer?.getData("text/plain") || draggedClipId.value;
  const targetIndex = visualTrackIndex(targetId);
  if (id && targetIndex >= 0) emit("reorder:clip", { id, targetIndex });
  draggedClipId.value = null;
};

let headerMarqueeFrame = 0;
let headerMarqueeTimer = 0;
const stopHeaderMarquee = (target?: HTMLElement | null) => {
  cancelAnimationFrame(headerMarqueeFrame);
  clearTimeout(headerMarqueeTimer);
  headerMarqueeFrame = 0;
  headerMarqueeTimer = 0;
  const label = target?.querySelector<HTMLElement>(".track-title-text");
  if (label) label.style.transform = "";
};
const stopHeaderMarqueeForEvent = (event: PointerEvent) => stopHeaderMarquee(event.currentTarget as HTMLElement | null);
const startHeaderMarquee = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement;
  const label = target.querySelector<HTMLElement>(".track-title-text");
  if (!label) return;
  const distance = label.scrollWidth - label.clientWidth;
  if (distance <= 0) return;
  stopHeaderMarquee(target);
  headerMarqueeTimer = window.setTimeout(() => {
    const startedAt = performance.now();
    const travelMs = Math.max(3_000, distance / 36 * 1_000);
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs;
      label.style.transform = `translateX(${-distance * (phase <= 1 ? phase : 2 - phase)}px)`;
      headerMarqueeFrame = requestAnimationFrame(tick);
    };
    headerMarqueeFrame = requestAnimationFrame(tick);
  }, 300);
};
onUnmounted(() => stopHeaderMarquee());

const visualAsset = (clip: VisualClip) => assetFor(clip)!;
const beginVisualMove = (event: PointerEvent, clip: VisualClip) => beginClipMove(event, clip);
const beginVisualTrim = (payload: { event: PointerEvent; edge: "start" | "end" }, clip: VisualClip) => beginClipTrim(payload.event, clip, payload.edge);
const beginCaptionMove = (event: PointerEvent, clip: CaptionClip) => beginClipMove(event, clip);
const beginAudioMove = (event: PointerEvent, clip: AudioClip) => beginClipMove(event, clip);
</script>

<template>
  <div ref="tracksScrollRef" class="timeline-tracks-container" @scroll="onScroll" @wheel="handleWheel">
    <div ref="tracksViewportRef" class="timeline-viewport" :style="tracksWidthStyle">
      <div class="timeline-ruler" @mousedown="handleMouseDown">
        <div class="ruler-info-spacer" />
        <div ref="ticksAreaRef" class="ruler-ticks-area">
          <div
            v-if="exportProgress && exportProgress.totalTimeMs > 0"
            class="ruler-export-progress-bar"
            :style="{ width: `${Math.min(100, Math.max(0, exportProgress.currentTimeMs / exportProgress.totalTimeMs * 100))}%` }"
          />
          <div v-for="second in visibleRulerSeconds" :key="second" class="ruler-marker" :class="{ 'is-major': second % 5 === 0 }" :style="rulerMarkerStyle(second)">
            <span v-if="second % 5 === 0" class="marker-label">{{ second }}s</span>
            <span class="marker-tick" />
          </div>
          <div class="timeline-playhead" :style="playheadStyle"><span class="playhead-knob" /></div>
        </div>
      </div>

      <div class="tracks-stack">
        <div
          v-if="screenClips.length"
          class="track-row video-track"
          data-visual-track-id="screen"
          :class="{ disabled: !groupEnabled(screenClips), dragging: draggedClipId === screenClips[0].id }"
          :style="visualTrackStyle('screen')"
          @dragover.prevent
          @drop.prevent="finishReorder($event, 'screen')"
        >
          <button type="button" class="track-info composition-track-info" :title="t('clickToToggleVideo')" @click="emit('toggle:group', 'screen')">
            <span class="track-drag-handle" draggable="true" :title="t('reorderVisualTrack')" @click.stop @dragstart.stop="beginReorder($event, screenClips[0].id)" @dragend="draggedClipId = null"><GripVertical class="track-grip" /></span>
            <Video class="track-icon" />
            <span class="track-title">{{ t('video') }}</span>
          </button>
          <div class="track-content video-content" :class="{ selected: screenClips.some((clip) => clip.id === selectedClipId) }">
            <TimelineVideoClip
              v-for="clip in screenClips"
              :key="clip.id"
              :clip="displayedClip(clip)"
              :asset="visualAsset(clip)"
              :duration="duration"
              :visible-seconds="visibleTimelineSeconds"
              :selected="selectedClipId === clip.id"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginVisualMove($event, clip)"
              @trim="beginVisualTrim($event, clip)"
            />
          </div>
        </div>

        <div
          v-for="clip in visualClips"
          :key="clip.id"
          class="track-row composition-media-track"
          :data-visual-track-id="clip.id"
          :class="{ disabled: !clip.enabled, dragging: draggedClipId === clip.id }"
          :style="visualTrackStyle(clip.id)"
          @dragover.prevent
          @drop.prevent="finishReorder($event, clip.id)"
        >
          <button type="button" class="track-info composition-track-info" @pointerenter="startHeaderMarquee" @pointerleave="stopHeaderMarqueeForEvent" @click="emit('toggle:clip', clip.id)">
            <span class="track-drag-handle" draggable="true" :title="t('reorderVisualTrack')" @click.stop @dragstart.stop="beginReorder($event, clip.id)" @dragend="draggedClipId = null"><GripVertical class="track-grip" /></span>
            <Video v-if="clip.kind === 'video'" class="track-icon" /><ImageIcon v-else class="track-icon" />
            <span class="track-title"><span class="track-title-text">{{ clip.name }}</span></span>
          </button>
          <div class="track-content composition-media-content" :class="{ selected: clip.id === selectedClipId }">
            <TimelineVideoClip
              :clip="displayedClip(clip)"
              :asset="visualAsset(clip)"
              :duration="duration"
              :visible-seconds="visibleTimelineSeconds"
              :selected="selectedClipId === clip.id"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginVisualMove($event, clip)"
              @trim="beginVisualTrim($event, clip)"
            />
          </div>
        </div>

        <div
          v-if="webcamClips.length"
          class="track-row camera-track"
          data-visual-track-id="webcam"
          :class="{ disabled: !groupEnabled(webcamClips), dragging: draggedClipId === webcamClips[0].id }"
          :style="visualTrackStyle('webcam')"
          @dragover.prevent
          @drop.prevent="finishReorder($event, 'webcam')"
        >
          <button type="button" class="track-info composition-track-info" :title="t('showOrHideWebcam')" @click="emit('toggle:group', 'webcam')">
            <span class="track-drag-handle" draggable="true" :title="t('reorderVisualTrack')" @click.stop @dragstart.stop="beginReorder($event, webcamClips[0].id)" @dragend="draggedClipId = null"><GripVertical class="track-grip" /></span>
            <component :is="groupEnabled(webcamClips) ? Eye : EyeOff" class="track-icon" />
            <span class="track-title">{{ t('webcam') }}</span>
          </button>
          <div class="track-content camera-content">
            <TimelineVideoClip
              v-for="clip in webcamClips"
              :key="clip.id"
              :clip="displayedClip(clip)"
              :asset="visualAsset(clip)"
              :duration="duration"
              :visible-seconds="visibleTimelineSeconds"
              :selected="selectedClipId === clip.id"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginVisualMove($event, clip)"
              @trim="beginVisualTrim($event, clip)"
            />
            <div v-if="selectedWebcam" class="camera-actions" @click.stop>
              <button type="button" :title="t('splitWebcamAtPlayhead')" @click="emit('split:clip', selectedWebcam.id)"><Scissors :size="13" /></button>
              <button type="button" :title="t('showOrHideSelectedWebcam')" @click="emit('toggle:clip', selectedWebcam.id)"><EyeOff :size="13" /></button>
              <button type="button" :title="t('trimWebcamStart')" @click="emit('trim:clip', { id: selectedWebcam.id, edge: 'start', timeMs: Math.round(currentTime * 1000) })"><MoveLeft :size="13" /></button>
              <button type="button" :title="t('trimWebcamEnd')" @click="emit('trim:clip', { id: selectedWebcam.id, edge: 'end', timeMs: Math.round(currentTime * 1000) })"><MoveRight :size="13" /></button>
            </div>
          </div>
        </div>

        <div class="track-row cursor-track">
          <div class="track-info static-info"><MousePointer class="track-icon" /><span class="track-title">{{ t('zooms') }}</span></div>
          <div class="track-content cursor-content" :title="t('clickToAddZoom')" @mousemove="onTrackMouseMove($event, 'zoom')" @mouseleave="onTrackMouseLeave('zoom')" @click="handleTrackClick($event, 'zoom')">
            <div v-if="hoverZoomTimeMs !== null" class="cursor-zoom-indicator preview-ghost" :style="layerStyle(hoverZoomTimeMs, hoverZoomTimeMs + 1200)">{{ t('addZoom') }}</div>
            <button
              v-for="zoom in zoomElements"
              :key="zoom.id"
              type="button"
              class="cursor-zoom-indicator"
              :class="{ selected: zoom.id === selectedZoomId }"
              :style="zoomElementStyle(displayedZoom(zoom))"
              :title="t('zoomTitle', { level: zoomScale(zoom.depth).toFixed(2) })"
              @click.stop="emit('select:zoom', zoom.id)"
              @pointerdown="beginZoomMove($event, zoom)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="beginZoomTrim($event, zoom, 'start')"><span v-if="trimStateFor(zoom.id)?.edge === 'start'" class="trim-side-badge">{{ (trimStateFor(zoom.id)!.durationMs / 1000).toFixed(1) }}s</span></span>
              <span class="clip-center-title">{{ zoomScale(zoom.depth).toFixed(2) }}×</span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginZoomTrim($event, zoom, 'end')"><span v-if="trimStateFor(zoom.id)?.edge === 'end'" class="trim-side-badge">{{ (trimStateFor(zoom.id)!.durationMs / 1000).toFixed(1) }}s</span></span>
            </button>
          </div>
        </div>

        <div class="track-row annotation-track">
          <div class="track-info static-info"><Type class="track-icon" /><span class="track-title">{{ t('captions') }}</span></div>
          <div class="track-content annotation-content" :title="t('clickToAddCaption')" @mousemove="onTrackMouseMove($event, 'caption')" @mouseleave="onTrackMouseLeave('caption')" @click="handleTrackClick($event, 'caption')">
            <div v-if="hoverCaptionTimeMs !== null" class="annotation-indicator preview-ghost" :style="layerStyle(hoverCaptionTimeMs, hoverCaptionTimeMs + 2000)">{{ t('addCaption') }}</div>
            <button
              v-for="clip in captionClips"
              :key="clip.id"
              type="button"
              class="annotation-indicator"
              :class="{ selected: clip.id === selectedClipId, disabled: !clip.enabled }"
              :style="layerStyle(displayedClip(clip).timelineStartMs, endMs(displayedClip(clip)))"
              @click.stop="emit('select:clip', clip.id)"
              @pointerdown="beginCaptionMove($event, clip)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="beginClipTrim($event, clip, 'start')"><span v-if="trimStateFor(clip.id)?.edge === 'start'" class="trim-side-badge">{{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s</span></span>
              <span class="clip-center-title"><Sparkles v-if="clip.isAiGenerated" :size="11" />{{ clip.name }}</span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')"><span v-if="trimStateFor(clip.id)?.edge === 'end'" class="trim-side-badge">{{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s</span></span>
            </button>
          </div>
        </div>

        <div v-if="systemAudioClips.length" class="track-row audio-track" :class="{ disabled: !groupEnabled(systemAudioClips) }">
          <button type="button" class="track-info" :title="t('clickToToggleSystemAudio')" @click="emit('toggle:group', 'system')"><Volume2 class="track-icon" /><span class="track-title">{{ t('system') }}</span></button>
          <div class="track-content audio-content">
            <button
              v-for="clip in systemAudioClips"
              :key="clip.id"
              type="button"
              class="audio-block"
              :class="{ selected: clip.id === selectedClipId }"
              :style="layerStyle(displayedClip(clip).timelineStartMs, endMs(displayedClip(clip)))"
              @click.stop="emit('select:clip', clip.id)"
              @pointerdown="beginAudioMove($event, clip)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="beginClipTrim($event, clip, 'start')" />
              <span class="audio-waveform-real"><span v-for="(height, index) in audioBars[clip.id]" :key="index" class="wave-bar" :style="{ height: `${audioBarHeight(height, clip.volume)}px` }" /><span v-if="!audioBars[clip.id]?.length" class="audio-unavailable">{{ t('waveformUnavailable') }}</span></span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')" />
            </button>
          </div>
        </div>

        <div v-if="microphoneClips.length" class="track-row audio-track" :class="{ disabled: !groupEnabled(microphoneClips) }">
          <button type="button" class="track-info" :title="t('clickToToggleMicrophone')" @click="emit('toggle:group', 'microphone')"><Mic class="track-icon" /><span class="track-title">{{ t('mic') }}</span></button>
          <div class="track-content audio-content">
            <button
              v-for="clip in microphoneClips"
              :key="clip.id"
              type="button"
              class="audio-block"
              :class="{ selected: clip.id === selectedClipId }"
              :style="layerStyle(displayedClip(clip).timelineStartMs, endMs(displayedClip(clip)))"
              @click.stop="emit('select:clip', clip.id)"
              @pointerdown="beginAudioMove($event, clip)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="beginClipTrim($event, clip, 'start')" />
              <span class="audio-waveform-real"><span v-for="(height, index) in audioBars[clip.id]" :key="index" class="wave-bar" :style="{ height: `${audioBarHeight(height, clip.volume)}px` }" /><span v-if="!audioBars[clip.id]?.length" class="audio-unavailable">{{ t('waveformUnavailable') }}</span></span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')" />
            </button>
          </div>
        </div>

        <div v-for="clip in importedAudioClips" :key="clip.id" class="track-row audio-track" :class="{ disabled: !clip.enabled }">
          <button type="button" class="track-info" @click="emit('toggle:clip', clip.id)"><Volume2 class="track-icon" /><span class="track-title"><span class="track-title-text">{{ clip.name }}</span></span></button>
          <div class="track-content audio-content">
            <button type="button" class="audio-block" :class="{ selected: clip.id === selectedClipId }" :style="layerStyle(displayedClip(clip).timelineStartMs, endMs(displayedClip(clip)))" @click.stop="emit('select:clip', clip.id)" @pointerdown="beginAudioMove($event, clip)">
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="beginClipTrim($event, clip, 'start')" />
              <span class="audio-waveform-real"><span v-for="(height, index) in audioBars[clip.id]" :key="index" class="wave-bar" :style="{ height: `${audioBarHeight(height, clip.volume)}px` }" /><span v-if="!audioBars[clip.id]?.length" class="audio-unavailable">{{ t('waveformUnavailable') }}</span></span>
              <span v-if="Math.abs(clip.playbackRate - 1) > .01" class="speed-badge segment-speed-badge">{{ clip.playbackRate.toFixed(2) }}×</span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-tracks-container { width: 100%; overflow-x: auto; overflow-y: hidden; border-radius: inherit; border: none; position: relative; user-select: none; -webkit-user-select: none; }
.timeline-viewport { position: relative; display: flex; flex-direction: column; min-height: 100%; }
.timeline-ruler { height: 28px; background: var(--color-bg-element); border-bottom: 1px solid var(--color-border); display: flex; user-select: none; }
.ruler-info-spacer { width: 120px; flex: 0 0 120px; border-right: 1px solid var(--color-border); background: var(--color-bg-surface); }
.ruler-ticks-area { flex: 1; position: relative; height: 100%; margin-left: 80px; margin-right: 150px; cursor: ew-resize; }
.ruler-export-progress-bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255, 90, 31, .25); border-right: 2px solid var(--color-primary); pointer-events: none; z-index: 4; transition: width .08s linear; }
.ruler-marker { position: absolute; top: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.marker-label { position: absolute; top: 4px; font-size: 8px; font-weight: 700; color: var(--text-muted); font-family: monospace; }
.marker-tick { width: 1px; height: 6px; background: var(--color-border-strong); }.ruler-marker.is-major .marker-tick { height: 10px; background: var(--color-border-dark); }
.timeline-playhead { position: absolute; top: 0; left: 0; width: 2px; height: 800px; background: var(--color-primary); z-index: 50; pointer-events: none; will-change: transform; }
.playhead-knob { position: absolute; top: 0; left: -5px; width: 12px; height: 12px; border-radius: 50%; background: var(--color-primary); box-shadow: var(--shadow-sm); }
.tracks-stack { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; }
.track-row { display: flex; align-items: center; height: 32px; position: relative; background: var(--color-bg-element); border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.track-row.disabled { opacity: .35; }.track-row.dragging { opacity: .55; }
.track-info { width: 120px; height: 100%; flex: 0 0 120px; display: flex; align-items: center; gap: 6px; padding: 0 8px; border: 0; border-right: 1px solid var(--color-border); background: var(--color-bg-surface); color: var(--text-secondary); cursor: pointer; text-align: left; }
.track-info:hover { background: var(--color-bg-surface-hover); }.static-info { cursor: default; }
.track-icon { width: 13px; height: 13px; flex: 0 0 auto; }.track-grip { width: 14px; height: 14px; color: var(--text-muted); }.track-drag-handle { display: inline-flex; align-items: center; cursor: grab; }.track-drag-handle:active { cursor: grabbing; }
.track-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }.track-title-text { display: inline-block; white-space: nowrap; transition: transform .05s linear; }
.track-content { flex: 1; height: 100%; position: relative; overflow: hidden; margin-left: 80px; margin-right: 150px; }
.video-content, .composition-media-content, .camera-content { background: var(--color-bg-element); }.cursor-content { background: var(--color-track-cursor-light); }.annotation-content { background: var(--color-track-annotation-light); }.audio-content { background: var(--color-track-audio-light); }
.track-content::after { content: ''; position: absolute; inset: 0; border: 1px solid transparent; border-radius: var(--radius-sm); pointer-events: none; z-index: 45; transition: border-color .15s ease, background-color .15s ease; }.track-content.selected::after { border-color: var(--color-primary); background: rgba(255,90,31,.04); }
.camera-actions { position: absolute; right: 8px; top: 4px; display: flex; gap: 4px; z-index: 60; }.camera-actions button { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-element); color: var(--text-primary); cursor: pointer; }.camera-actions button:hover { color: var(--color-primary); border-color: var(--color-primary); }
.cursor-zoom-indicator, .annotation-indicator { position: absolute; top: 4px; height: 24px; display: flex; align-items: center; justify-content: center; padding: 0 6px; border: 1px solid transparent; border-radius: var(--radius-sm); color: #fff; font-size: 8px; font-weight: 700; cursor: grab; box-shadow: var(--shadow-sm); transition: transform .15s ease, border-color .15s ease; overflow: visible; }
.cursor-zoom-indicator { background: var(--color-track-cursor); }.annotation-indicator { background: var(--color-track-annotation); }.annotation-indicator.disabled { opacity: .42; }
.cursor-zoom-indicator:hover, .annotation-indicator:hover { transform: translateY(-1px); border-color: #fff; }.cursor-zoom-indicator.selected, .annotation-indicator.selected { outline: 2px solid var(--color-primary); }
.preview-ghost { opacity: .65; border: 1.5px dashed var(--color-primary) !important; pointer-events: none; z-index: 8; box-shadow: 0 0 8px rgba(255,90,31,.3); animation: pulse-ghost 1.2s infinite alternate ease-in-out; }@keyframes pulse-ghost { from { opacity: .45; } to { opacity: .85; } }
.clip-center-title { display: inline-flex; align-items: center; gap: 4px; pointer-events: none; white-space: nowrap; }
.audio-block { position: absolute; top: 0; bottom: 0; min-width: 14px; padding: 0; border: 1px solid transparent; border-radius: var(--radius-sm); overflow: hidden; background: var(--color-track-audio-light); cursor: grab; }.audio-block:hover { border-color: var(--color-primary); border-style: dashed; }.audio-block.selected { border-color: var(--color-primary); border-style: solid; box-shadow: inset 0 0 0 1px var(--color-primary); }
.audio-waveform-real { position: absolute; inset: 0 7px; display: flex; align-items: center; justify-content: space-between; gap: 2px; overflow: hidden; opacity: .82; }.wave-bar { flex: 1 1 auto; min-width: 1px; max-width: 4px; border-radius: 2px; background: var(--color-track-audio); }.audio-unavailable { display: grid; place-items: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 9px; }
.trim-handle { position: absolute; top: 0; bottom: 0; width: 6px; z-index: 70; cursor: col-resize; background: rgba(255,255,255,.25); transition: background var(--fast) ease; }.trim-handle:hover { background: var(--color-primary); }.trim-handle.start { left: 0; border-radius: var(--radius-sm) 0 0 var(--radius-sm); }.trim-handle.end { right: 0; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.trim-side-badge { position: absolute; top: 50%; transform: translateY(-50%); padding: 1px 5px; border-radius: var(--radius-sm); background: var(--color-primary); color: #fff; font-size: 9px; font-weight: 800; font-family: monospace; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.3); }.trim-handle.start .trim-side-badge { left: 8px; }.trim-handle.end .trim-side-badge { right: 8px; }
.speed-badge { position: absolute; z-index: 35; padding: 1px 4px; border-radius: var(--radius-xs); background: var(--color-primary); color: #fff; font-size: 9px; font-weight: 700; }.segment-speed-badge { top: 4px; right: 5px; }
</style>
