<script setup lang="ts">
import { ref } from "vue";
import {
  Video,
  Volume2,
  Mic,
  MousePointer,
  Type,
  Scissors,
  MoveLeft,
  MoveRight,
  Eye,
  EyeOff,
  Unlink,
  Sparkles,
  GripVertical,
  Image as ImageIcon,
} from "@lucide/vue";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import Button from "~/ui/button/Button.vue";
import type { ZoomElement } from "../zoom/zoom-types";
import type { ExportProgress } from "../../export/export-types";
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { ProjectComposition } from "../composition/composition-types";
import { useTimelineTracks } from "./composables/useTimelineTracks";
import TimelineVideoClip from './TimelineVideoClip.vue';
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("TimelineTracks");

const props = defineProps<{
  currentTime: number;
  duration: number;
  zoomLevel: number;
  videoSrc: string | null;
  editorData?: ProjectEditorData | null;
  exportProgress?: ExportProgress | null;

  // Track toggle states
  isVideoEnabled: boolean;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
  isCameraEnabled: boolean;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
  composition: ProjectComposition;
  selectedCompositionLayerId: string | null;
  selectedCameraLayerId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:currentTime", value: number): void;
  (e: "update:zoomLevel", value: number): void;
  (e: "toggle:video"): void;
  (e: "toggle:systemAudio"): void;
  (e: "toggle:micAudio"): void;
  (e: "select:zoom", zoomId: string): void;
  (e: "select:composition-layer", layerId: string): void;
  (e: "toggle:composition-layer", layerId: string): void;
  (e: "select:base-video"): void;
  (e: "select:camera-layer", layerId: string): void;
  (e: "toggle:camera"): void;
  (e: "toggle:camera-layer"): void;
  (e: "split:camera"): void;
  (e: "trim:camera", edge: "start" | "end"): void;
  (e: "unlink"): void;
  (e: "unlink-track", trackKind: string): void;
  (e: "move:clip", payload: { id: string; deltaMs: number }): void;
  (e: "preview:move-clip", payload: { id: string; startMs: number; endMs: number }): void;
  (e: "move:clip-position", payload: { id: string; startMs: number; endMs: number }): void;
  (e: "trim:clip-edge", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (e: "preview:clip-edge", payload: { id: string; edge: "start" | "end"; timeMs: number }): void;
  (e: "reorder:composition-layer", payload: { id: string; targetIndex: number }): void;
  (e: "preview:reorder-composition-layer", payload: { id: string; targetIndex: number }): void;
}>();

const {
  captionLayers,
  compositionVisualLayers,
  compositionAudioLayers,
  compositionAudioBars,
  cameraLayers,
  visualTrackIndex,
  visualTrackStyle,
  mainVideoLayer,
  layerStyle,
  zoomElementStyle,
  tracksScrollRef,
  tracksViewportRef,
  ticksAreaRef,
  micAudioWaveBars,
  systemAudioBuffer,
  micAudioBuffer,
  systemBars,
  micBars,
  waveformStyle,
  compositionAudioBarHeight,
  visibleTimelineSeconds,
  visibleRulerSeconds,
  thumbnailStyle,
  rulerMarkerStyle,
  cameraThumbnailSeconds,
  cameraThumbnailStyle,
  handleWheel,
  thumbnails,
  webcamThumbnails,
  tracksWidthStyle,
  playheadStyle,
  handleMouseDown,
  handleTrackClick,
  hoverZoomTimeMs,
  hoverCaptionTimeMs,
  onTrackMouseMove,
  onTrackMouseLeave,
  onScroll,
  beginTrimDrag,
  beginMoveDrag,
  activeTrimState,
  formatTrimTime,
} = useTimelineTracks(props, emit);

const draggedLayerId = ref<string | null>(null);
const beginLayerReorder = (event: DragEvent, id: string) => {
  draggedLayerId.value = id;
  event.dataTransfer?.setData("text/plain", id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
};
const finishLayerReorder = (event: DragEvent, targetId: string) => {
  const id = event.dataTransfer?.getData("text/plain") || draggedLayerId.value;
  if (id) {
    const targetIndex = visualTrackIndex(targetId);
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const insertionIndex = targetId === id
      ? targetIndex
      : targetIndex + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
    emit("reorder:composition-layer", { id, targetIndex: insertionIndex });
  }
  draggedLayerId.value = null;
};
let headerMarqueeFrame = 0;
let headerMarqueeTimer = 0;
const stopHeaderMarquee = (target?: HTMLElement) => {
  window.cancelAnimationFrame(headerMarqueeFrame);
  window.clearTimeout(headerMarqueeTimer);
  headerMarqueeFrame = 0;
  headerMarqueeTimer = 0;
  const label = target?.querySelector<HTMLElement>(".track-title-text");
  if (label) label.style.transform = "";
};
const startHeaderMarquee = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement;
  const label = target.querySelector<HTMLElement>(".track-title-text");
  if (!label) return;
  const distance = label.scrollWidth - label.clientWidth;
  if (distance <= 0) return;
  stopHeaderMarquee(target);
  headerMarqueeTimer = window.setTimeout(() => {
    const startedAt = performance.now();
    const travelMs = Math.max(3000, (distance / 36) * 1000);
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs;
      label.style.transform = `translateX(${-distance * (phase <= 1 ? phase : 2 - phase)}px)`;
      headerMarqueeFrame = window.requestAnimationFrame(tick);
    };
    headerMarqueeFrame = window.requestAnimationFrame(tick);
  }, 300);
};

const selectMainVideoLayer = () => {
  if (mainVideoLayer.value) emit("select:composition-layer", mainVideoLayer.value.id);
  else emit("select:base-video");
};

(void tracksScrollRef, tracksViewportRef, ticksAreaRef);

const previewLayerReorder = (event: DragEvent, targetId: string) => {
  const id = event.dataTransfer?.getData("text/plain") || draggedLayerId.value;
  if (!id || id === targetId) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  const targetIndex = visualTrackIndex(targetId);
  if (targetIndex < 0) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const insertionIndex = targetIndex + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
  if (visualTrackIndex(id) === insertionIndex) return;
  emit("preview:reorder-composition-layer", { id, targetIndex: insertionIndex });
};
</script>

<template>
  <div
    class="timeline-tracks-container"
    ref="tracksScrollRef"
    @scroll="onScroll"
    @wheel="handleWheel"
  >
    <div
      class="timeline-viewport"
      ref="tracksViewportRef"
      :style="tracksWidthStyle"
    >
      <!-- Ruler/Header -->
      <div class="timeline-ruler" @mousedown="handleMouseDown">
        <div class="ruler-info-spacer"></div>
        <div class="ruler-ticks-area" ref="ticksAreaRef">
          <!-- Real-Time Export Progress Bar Overlay -->
          <div
            v-if="exportProgress && exportProgress.totalTimeMs > 0"
            class="ruler-export-progress-bar"
            :style="{ width: `${Math.min(100, Math.max(0, (exportProgress.currentTimeMs / exportProgress.totalTimeMs) * 100))}%` }"
          ></div>
          <div
            v-for="second in visibleRulerSeconds"
            :key="second"
            class="ruler-marker"
            :class="{ 'is-major': second % 5 === 0 }"
            :style="rulerMarkerStyle(second)"
          >
            <span v-if="second % 5 === 0" class="marker-label"
              >{{ second }}s</span
            >
            <div class="marker-tick"></div>
          </div>

          <!-- Scrub Playhead vertical indicator line -->
          <div class="timeline-playhead" :style="playheadStyle">
            <div class="playhead-knob"></div>
          </div>
        </div>
      </div>

      <!-- Tracks Stack -->
      <div class="tracks-stack">
        <!-- 1. Video Track -->
        <div
          class="track-row video-track"
          data-visual-track-id="base-video"
          :class="{ disabled: !isVideoEnabled }"
          :style="visualTrackStyle('base-video')"
          @dragover.prevent="previewLayerReorder($event, 'base-video')"
          @drop.prevent="finishLayerReorder($event, 'base-video')"
        >
          <div
            class="track-info composition-track-info"
            @click="emit('toggle:video')"
            :title="t('clickToToggleVideo')"
          >
            <span class="track-drag-handle" draggable="true" :title="t('reorderVisualTrack')" @dragstart.stop="beginLayerReorder($event, 'base-video')" @dragend="draggedLayerId = null">
              <GripVertical class="track-grip" aria-hidden="true" />
            </span>
            <Video class="track-icon" />
            <span class="track-title">{{ t('video') }}</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              :tooltip="t('unlinkVideoTrack')"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'video')"
            />
          </div>
          <div
            class="track-content video-content"
            :class="{
              selected:
                selectedCompositionLayerId === 'base-video' ||
                (mainVideoLayer && selectedCompositionLayerId === mainVideoLayer.id),
            }"
            @click.stop="selectMainVideoLayer"
          >
            <!-- Virtualized Thumbnails Container -->
            <div class="thumbnails-track">
              <div
                v-for="second in visibleTimelineSeconds"
                :key="second"
                class="thumbnail-frame"
                :style="thumbnailStyle(second)"
              >
                <img
                  v-if="thumbnails[second]"
                  :src="thumbnails[second]"
                  class="thumbnail-img"
                  :alt="t('frame')"
                  draggable="false"
                />
                <Skeleton v-else width="100%" height="100%" radius="0" />
              </div>
            </div>
            <span
              v-if="composition.baseVideoPlaybackRate && Math.abs(composition.baseVideoPlaybackRate - 1.0) > 0.01"
              class="speed-badge main-video-speed-badge"
            >
              {{ composition.baseVideoPlaybackRate.toFixed(2) }}×
            </span>
          </div>
        </div>

        <div
          v-for="layer in compositionVisualLayers"
          :key="layer.id"
          class="track-row composition-media-track"
          :data-visual-track-id="layer.id"
          :class="{ disabled: !layer.enabled, dragging: draggedLayerId === layer.id }"
          :style="visualTrackStyle(layer.id)"
          @dragover.prevent="previewLayerReorder($event, layer.id)"
          @drop.prevent="finishLayerReorder($event, layer.id)"
        >
          <div class="track-info composition-track-info" @pointerenter="startHeaderMarquee" @pointerleave="stopHeaderMarquee($event.currentTarget)" @click="emit('toggle:composition-layer', layer.id)">
            <span class="track-drag-handle" draggable="true" :title="t('reorderVisualTrack')" @click.stop @dragstart.stop="beginLayerReorder($event, layer.id)" @dragend="draggedLayerId = null">
              <GripVertical class="track-grip" aria-hidden="true" />
            </span>
            <Video v-if="layer.kind === 'video'" class="track-icon" />
            <ImageIcon v-else class="track-icon" />
            <span class="track-title"><span class="track-title-text">{{ layer.name }}</span></span>
          </div>
          <div class="track-content composition-media-content" :class="{ selected: layer.id === selectedCompositionLayerId }">
            <TimelineVideoClip
              v-if="layer.kind === 'video' && composition.media.find((asset) => asset.id === layer.assetId)?.src"
              :layer="layer"
              :source="composition.media.find((asset) => asset.id === layer.assetId)!.src"
              :duration="duration"
              :visible-seconds="visibleTimelineSeconds"
              :selected="layer.id === selectedCompositionLayerId"
              @select="emit('select:composition-layer', layer.id)"
              @move="beginMoveDrag($event, layer.id, layer.startMs, layer.endMs)"
              @trim="beginTrimDrag($event.event, layer.id, $event.edge, layer.startMs, layer.endMs)"
            />
            <button v-else type="button" class="composition-media-clip" :style="layerStyle(layer.startMs, layer.endMs)" @click.stop="emit('select:composition-layer', layer.id)" @pointerdown="beginMoveDrag($event, layer.id, layer.startMs, layer.endMs)">
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown="beginTrimDrag($event, layer.id, 'start', layer.startMs, layer.endMs)" />
              <span class="clip-label-overlay">{{ layer.name }}</span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown="beginTrimDrag($event, layer.id, 'end', layer.startMs, layer.endMs)" />
            </button>
          </div>
        </div>

        <!-- 1b. Webcam sidecar track -->
        <div
          v-if="cameraLayers.length"
          class="track-row camera-track"
          data-visual-track-id="webcam"
          :class="{ disabled: !isCameraEnabled }"
          :style="visualTrackStyle('webcam')"
          @dragover.prevent="previewLayerReorder($event, 'webcam')"
          @drop.prevent="finishLayerReorder($event, 'webcam')"
        >
          <div
            class="track-info composition-track-info"
            @click="emit('toggle:camera')"
            :title="t('showOrHideWebcam')"
          >
            <span class="track-drag-handle" draggable="true" :title="t('reorderVisualTrack')" @dragstart.stop="beginLayerReorder($event, 'webcam')" @dragend="draggedLayerId = null">
              <GripVertical class="track-grip" aria-hidden="true" />
            </span>
            <component
              :is="isCameraEnabled ? Eye : EyeOff"
              class="track-icon"
            />
            <span class="track-title">{{ t('webcam') }}</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              :tooltip="t('unlinkWebcamTrack')"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'webcam')"
            />
          </div>
          <div class="track-content camera-content">
            <button
              v-for="layer in cameraLayers"
              :key="layer.id"
              type="button"
              class="camera-clip"
              :class="{
                selected: layer.id === selectedCameraLayerId,
                disabled: !layer.enabled,
              }"
              :style="layerStyle(layer.startMs, layer.endMs)"
              @click.stop="emit('select:camera-layer', layer.id)"
              @pointerdown="beginMoveDrag($event, layer.id, layer.startMs, layer.endMs)"
            >
              <div class="thumbnails-track">
                <div
                  v-for="second in cameraThumbnailSeconds(layer)"
                  :key="second"
                  class="thumbnail-frame"
                  :style="cameraThumbnailStyle(second, layer)"
                >
                  <img
                    v-if="webcamThumbnails[second]"
                    :src="webcamThumbnails[second]"
                    class="thumbnail-img"
                    alt="webcam frame"
                  />
                  <Skeleton v-else width="100%" height="100%" radius="0" />
                </div>
              </div>
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown="beginTrimDrag($event, layer.id, 'start', layer.startMs, layer.endMs)">
                <span v-if="activeTrimState?.id === layer.id && activeTrimState.edge === 'start'" class="trim-side-badge">
                  {{ formatTrimTime(activeTrimState.durationMs ?? 0) }}
                </span>
              </span>
              <span class="clip-label-overlay">
                {{ t('webcam') }}
                <span v-if="layer.playbackRate && Math.abs(layer.playbackRate - 1.0) > 0.01" class="speed-badge">
                  {{ layer.playbackRate.toFixed(2) }}×
                </span>
              </span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown="beginTrimDrag($event, layer.id, 'end', layer.startMs, layer.endMs)">
                <span v-if="activeTrimState?.id === layer.id && activeTrimState.edge === 'end'" class="trim-side-badge">
                  {{ formatTrimTime(activeTrimState.durationMs ?? 0) }}
                </span>
              </span>
            </button>
            <div
              v-if="selectedCameraLayerId"
              class="camera-actions"
              @click.stop
            >
              <button
                type="button"
                :title="t('splitWebcamAtPlayhead')"
                @click="emit('split:camera')"
              >
                <Scissors :size="13" />
              </button>
              <button
                type="button"
                :title="t('showOrHideSelectedWebcam')"
                @click="emit('toggle:camera-layer')"
              >
                <EyeOff :size="13" />
              </button>
              <button
                type="button"
                :title="t('trimWebcamStart')"
                @click="emit('trim:camera', 'start')"
              >
                <MoveLeft :size="13" />
              </button>
              <button
                type="button"
                :title="t('trimWebcamEnd')"
                @click="emit('trim:camera', 'end')"
              >
                <MoveRight :size="13" />
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Cursor / Zooms Track (Must be placed strictly below all video/image/webcam tracks) -->
        <div class="track-row cursor-track">
          <div class="track-info" @click="emit('toggle:composition-layer', layer.id)">
            <MousePointer class="track-icon" />
            <span class="track-title">{{ t('zooms') }}</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              :tooltip="t('unlinkZoomsTrack')"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'zooms')"
            />
          </div>
          <div
            class="track-content cursor-content"
            :title="t('clickToAddZoom')"
            @mousemove="onTrackMouseMove($event, 'zoom')"
            @mouseleave="onTrackMouseLeave('zoom')"
            @click="handleTrackClick($event, 'zoom')"
          >
            <!-- Hover Preview Ghost Bar -->
            <div
              v-if="hoverZoomTimeMs !== null"
              class="cursor-zoom-indicator preview-ghost"
              :style="layerStyle(hoverZoomTimeMs, hoverZoomTimeMs + 1200)"
            >
              {{ t('addZoom') }}
            </div>

            <button
              v-for="element in zoomElements"
              :key="element.id"
              type="button"
              class="cursor-zoom-indicator"
              :class="{ selected: element.id === selectedZoomId }"
              :style="zoomElementStyle(element)"
              :title="t('zoomTitle', { level: [1.25, 1.5, 1.8, 2.2, 3.5, 5][element.depth - 1].toFixed(2) })"
              @click.stop="emit('select:zoom', element.id)"
              @pointerdown="beginMoveDrag($event, element.id, element.startMs, element.endMs)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown="beginTrimDrag($event, element.id, 'start', element.startMs, element.endMs)">
                <span v-if="activeTrimState?.id === element.id && activeTrimState.edge === 'start'" class="trim-side-badge">
                  {{ formatTrimTime(activeTrimState.durationMs ?? 0) }}
                </span>
              </span>
              <span class="clip-center-title">
                {{ [1.25, 1.5, 1.8, 2.2, 3.5, 5][element.depth - 1].toFixed(2) }}×
              </span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown="beginTrimDrag($event, element.id, 'end', element.startMs, element.endMs)">
                <span v-if="activeTrimState?.id === element.id && activeTrimState.edge === 'end'" class="trim-side-badge">
                  {{ formatTrimTime(activeTrimState.durationMs ?? 0) }}
                </span>
              </span>
            </button>
          </div>
        </div>

        <!-- 3. Captions / Annotations Track (Below cursor/zooms) -->
        <div class="track-row annotation-track">
          <div class="track-info">
            <Type class="track-icon" />
            <span class="track-title">{{ t('captions') }}</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              :tooltip="t('unlinkCaptionsTrack')"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'captions')"
            />
          </div>
          <div
            class="track-content annotation-content"
            :title="t('clickToAddCaption')"
            @mousemove="onTrackMouseMove($event, 'caption')"
            @mouseleave="onTrackMouseLeave('caption')"
            @click="handleTrackClick($event, 'caption')"
          >
            <!-- Hover Preview Ghost Bar -->
            <div
              v-if="hoverCaptionTimeMs !== null"
              class="annotation-indicator preview-ghost"
              :style="layerStyle(hoverCaptionTimeMs, hoverCaptionTimeMs + 2000)"
            >
              {{ t('addCaption') }}
            </div>

            <button
              v-for="layer in captionLayers"
              :key="layer.id"
              type="button"
              class="annotation-indicator"
              :class="{ selected: layer.id === selectedCompositionLayerId }"
              :style="layerStyle(layer.startMs, layer.endMs)"
              @click.stop="emit('select:composition-layer', layer.id)"
              @pointerdown="beginMoveDrag($event, layer.id, layer.startMs, layer.endMs)"
            >
              <span class="trim-handle start" :title="t('trimStart')" @pointerdown="beginTrimDrag($event, layer.id, 'start', layer.startMs, layer.endMs)">
                <span v-if="activeTrimState?.id === layer.id && activeTrimState.edge === 'start'" class="trim-side-badge">
                  {{ formatTrimTime(activeTrimState.durationMs ?? 0) }}
                </span>
              </span>
              <span class="clip-center-title">
                <Sparkles v-if="layer.isAiGenerated" :size="11" class="ai-clip-icon" :title="t('generatedByAI')" />
                {{ layer.name }}
              </span>
              <span class="trim-handle end" :title="t('trimEnd')" @pointerdown="beginTrimDrag($event, layer.id, 'end', layer.startMs, layer.endMs)">
                <span v-if="activeTrimState?.id === layer.id && activeTrimState.edge === 'end'" class="trim-side-badge">
                  {{ formatTrimTime(activeTrimState.durationMs ?? 0) }}
                </span>
              </span>
            </button>
          </div>
        </div>

        <!-- 4. Audio System Track (Bottom) -->
        <div
          class="track-row audio-track"
          :class="{ disabled: !isSystemAudioEnabled }"
        >
          <div
            class="track-info"
            @click="emit('toggle:systemAudio')"
            :title="t('clickToToggleSystemAudio')"
          >
            <Volume2 class="track-icon" />
            <span class="track-title">{{ t('system') }}</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              :tooltip="t('unlinkSystemAudioTrack')"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'systemAudio')"
            />
          </div>
          <div
            class="track-content audio-content"
            :class="{ selected: selectedCompositionLayerId === 'system-audio' }"
            @click.stop="emit('select:composition-layer', 'system-audio')"
          >
            <div class="audio-block" style="position: relative; padding: 0">
              <span
                v-if="composition.baseVideoPlaybackRate && Math.abs(composition.baseVideoPlaybackRate - 1.0) > 0.01"
                class="speed-badge audio-speed-badge"
              >
                {{ composition.baseVideoPlaybackRate.toFixed(2) }}×
              </span>
              <!-- Real Waveform -->
              <div
                v-if="systemAudioBuffer"
                :style="waveformStyle"
                class="audio-waveform-real"
              >
                <div
                  v-for="(height, index) in systemBars"
                  :key="index"
                  class="wave-bar"
                  :style="{ height: `${height}px` }"
                ></div>
              </div>
            </div>
            <div class="trim-handle start"></div>
            <div class="trim-handle end"></div>
          </div>
        </div>

        <!-- 4b. Audio Microphone Track (Bottom) -->
        <div
          class="track-row audio-track"
          :class="{ disabled: !isMicAudioEnabled }"
        >
          <div
            class="track-info"
            @click="emit('toggle:micAudio')"
            :title="t('clickToToggleMicrophone')"
          >
            <Mic class="track-icon" />
            <span class="track-title">{{ t('mic') }}</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              :tooltip="t('unlinkMicrophoneTrack')"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'micAudio')"
            />
          </div>
          <div
            class="track-content audio-content"
            :class="{ selected: selectedCompositionLayerId === 'microphone' }"
            @click.stop="emit('select:composition-layer', 'microphone')"
          >
            <div class="audio-block" style="position: relative; padding: 0">
              <span
                v-if="composition.baseVideoPlaybackRate && Math.abs(composition.baseVideoPlaybackRate - 1.0) > 0.01"
                class="speed-badge audio-speed-badge"
              >
                {{ composition.baseVideoPlaybackRate.toFixed(2) }}×
              </span>
              <!-- Real Waveform -->
              <div
                v-if="micAudioBuffer"
                :style="waveformStyle"
                class="audio-waveform-real"
              >
                <div
                  v-for="(height, index) in micBars"
                  :key="index"
                  class="wave-bar"
                  :style="{ height: `${height}px` }"
                ></div>
              </div>
              <!-- Fallback Simulated Waveform -->
              <div v-else class="audio-waveform-simulated">
                <div
                  v-for="(height, index) in micAudioWaveBars"
                  :key="index"
                  class="wave-bar"
                  :style="{ height: `${height}px` }"
                ></div>
              </div>
            </div>
            <div class="trim-handle start"></div>
            <div class="trim-handle end"></div>
          </div>
        </div>

        <div v-for="layer in compositionAudioLayers" :key="layer.id" class="track-row audio-track" :class="{ disabled: !layer.enabled }">
          <div class="track-info" @click="emit('toggle:composition-layer', layer.id)">
            <Volume2 class="track-icon" />
            <span class="track-title">{{ layer.name }}</span>
          </div>
          <div class="track-content audio-content" :class="{ selected: layer.id === selectedCompositionLayerId }" @click.stop="emit('select:composition-layer', layer.id)">
            <div class="audio-block composition-audio-block" :style="layerStyle(layer.startMs, layer.endMs)">
              <div v-if="compositionAudioBars[layer.id]?.length" :style="waveformStyle" class="audio-waveform-real">
                <div v-for="(height, barIndex) in compositionAudioBars[layer.id]" :key="barIndex" class="wave-bar" :style="{ height: `${compositionAudioBarHeight(height, layer.volume ?? 100)}px` }" />
              </div>
              <span v-else class="audio-unavailable">{{ t('waveformUnavailable') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-tracks-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: inherit;
  border: none;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
}

.ruler-export-progress-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(255, 90, 31, 0.25);
  border-right: 2px solid var(--color-primary);
  pointer-events: none;
  z-index: 4;
  transition: width 0.08s linear;
}

.timeline-viewport {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.camera-content {
  position: relative;
  height: 100%;
  background: var(--color-bg-element);
}
.composition-media-track.dragging { opacity: .55; }
.composition-track-info { cursor: grab; }
.composition-track-info:active { cursor: grabbing; }
.track-grip { width: 14px; color: var(--text-muted); flex: 0 0 auto; }
.track-drag-handle { display: inline-flex; align-items: center; cursor: grab; }
.track-drag-handle:active { cursor: grabbing; }
.composition-media-content { position: relative; height: 100%; background: var(--color-bg-element); }
.composition-media-clip {
  position: absolute; top: 0; bottom: 0; min-width: 14px; padding: 0; border: 0;
  border-radius: var(--radius-sm); background: var(--color-bg-surface); color: var(--text-primary);
  cursor: grab; overflow: hidden;
}
.composition-media-clip:active { cursor: grabbing; }
.composition-audio-block { position: absolute; top: 0; bottom: 0; height: auto; padding: 0; }
.audio-unavailable { display: grid; height: 100%; place-items: center; color: var(--text-muted); font-size: 11px; }
.camera-clip {
  position: absolute;
  top: 0;
  bottom: 0;
  height: 100%;
  border: none;
  border-radius: 0;
  background: var(--color-bg-surface);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}
.clip-label-overlay {
  position: absolute;
  left: 8px;
  top: 2px;
  font-size: 9px;
  font-weight: 800;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  z-index: 5;
  pointer-events: none;
}
.camera-clip.disabled {
  opacity: 0.38;
  text-decoration: line-through;
}
.camera-actions {
  position: absolute;
  right: 8px;
  top: 4px;
  display: flex;
  gap: 4px;
}
.camera-actions button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-element);
  color: var(--text-primary);
  cursor: pointer;
}
.camera-actions button:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

/* Track Specific Stylings */
/* 1. Video, Webcam, and Audio Track Overlays */
.video-track .track-content,
.camera-clip,
.audio-track .track-content {
  cursor: pointer;
  position: relative;
}

.video-track .track-content::after,
.camera-clip::after,
.audio-track .track-content::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition:
    border-color 0.15s ease,
    border-style 0.15s ease,
    background-color 0.15s ease;
}

.video-track .track-content:hover::after,
.camera-clip:hover::after,
.audio-track .track-content:hover::after {
  border: 1px dashed var(--color-primary);
  background-color: rgba(255, 90, 31, 0.04);
}

.video-track .track-content.selected::after,
.camera-clip.selected::after,
.audio-track .track-content.selected::after {
  border: 1px solid var(--color-primary);
  background-color: rgba(255, 90, 31, 0.06);
}

/* Ruler */
.timeline-ruler {
  height: 28px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  user-select: none;
}

.ruler-info-spacer {
  width: 120px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.unlink-header-btn {
  height: 20px !important;
  font-size: 10px !important;
  padding: 0 6px !important;
  gap: 4px !important;
}

.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 10;
  cursor: col-resize;
  background: rgba(255, 255, 255, 0.25);
  transition: background var(--fast) ease;
}

.trim-handle:hover {
  background: var(--color-primary);
}

.trim-handle.start {
  left: 0;
  border-top-left-radius: var(--radius-sm);
  border-bottom-left-radius: var(--radius-sm);
}

.trim-handle.end {
  right: 0;
  border-top-right-radius: var(--radius-sm);
  border-bottom-right-radius: var(--radius-sm);
}

.trim-side-badge {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: var(--color-primary);
  color: #ffffff;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  font-size: 9px;
  font-weight: 800;
  font-family: monospace;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  z-index: 20;
}

.trim-handle.start .trim-side-badge {
  left: 8px;
}

.trim-handle.end .trim-side-badge {
  right: 8px;
}

.clip-center-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  white-space: nowrap;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ai-clip-icon {
  color: var(--color-primary-light, #ffd0b8);
  flex-shrink: 0;
}

.ruler-ticks-area {
  flex: 1;
  position: relative;
  height: 100%;
  cursor: ew-resize;
  margin-left: 80px;
  margin-right: 150px;
}

.ruler-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.marker-label {
  font-size: 8px;
  font-weight: 700;
  color: var(--text-muted);
  font-family: monospace;
  position: absolute;
  top: 4px;
}

.marker-tick {
  width: 1px;
  height: 6px;
  background-color: var(--color-border-strong);
}

.is-major .marker-tick {
  height: 10px;
  background-color: var(--color-border-dark);
}

/* Playhead */
.timeline-playhead {
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  background: var(--color-primary);
  z-index: 10;
  pointer-events: none;
  height: 500px;
  transition: background-color 140ms ease, opacity 140ms ease, border-color 140ms ease;
  transform: translate3d(0, 0, 0);
}

.playhead-knob {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  position: absolute;
  top: 0;
  left: -5px;
  box-shadow: var(--shadow-sm);
  cursor: grab;
}

.tracks-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
}

.cursor-track,
.annotation-track,
.audio-track {
  order: 10000;
}

/* Slim Track Row */
.track-row {
  display: flex;
  align-items: center;
  height: 32px; /* Fine/thin track rows as requested */
  background: var(--color-bg-element);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  position: relative;
  will-change: transform;
}

.track-row.disabled {
  opacity: 0.35;
}

.track-info {
  width: 120px;
  height: 100%;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 6px;
  z-index: 10;
  cursor: pointer;
  user-select: none;
  transition: background-color var(--fast) ease;
}

.track-info:hover {
  background: var(--color-bg-surface-hover);
}

.track-icon {
  width: 13px;
  height: 13px;
  color: var(--text-secondary);
}

.track-title {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: transform 0.05s linear;
}
.track-title-text { display: inline-block; white-space: nowrap; transition: transform 0.05s linear; }

.track-unlink-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-element);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  transition: all var(--fast) ease;
}

.track-unlink-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

.track-content {
  flex: 1;
  height: 100%;
  position: relative;
  overflow: hidden;
  margin-left: 80px;
  margin-right: 150px;
}

/* Track Specific Stylings */
/* 1. Video Track */
.video-track .track-content {
  background-color: var(--color-track-video-light);
}

.image-clip {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-primary) 25%, transparent);
  color: white;
  overflow: hidden;
  font-size: 11px;
  cursor: pointer;
  z-index: 6;
}

.image-clip.selected {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.thumbnails-track {
  position: relative;
  width: 100%;
  height: 100%;
}

.thumbnail-frame {
  position: absolute;
  top: 0;
  height: 100%;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
  background: var(--color-bg-surface);
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  display: block;
}

.thumbnail-placeholder {
  width: 100%;
  height: 100%;
  background: rgba(99, 102, 241, 0.05);
}

/* 2. Audio Tracks */
.audio-track .track-content {
  background-color: var(--color-track-audio-light);
}

.audio-block {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 10px;
}

.audio-waveform-simulated {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
}

.wave-bar {
  flex: 1;
  max-width: 4px;
  background: var(--color-track-audio);
  border-radius: 2px;
  opacity: 0.7;
}

/* 3. Cursor Zooms Track */
.cursor-track .track-content {
  background-color: var(--color-track-cursor-light);
}

.cursor-zoom-indicator {
  position: absolute;
  top: 4px;
  height: 24px;
  background: var(--color-track-cursor);
  border-radius: var(--radius-sm);
  color: white;
  font-size: 8px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  box-shadow: var(--shadow-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;
}

.cursor-zoom-indicator:hover {
  transform: translateY(-1px);
  border-color: white;
}

.cursor-zoom-indicator.selected {
  border-color: white;
  outline: 2px solid var(--color-primary);
}

.cursor-zoom-indicator.preview-ghost,
.annotation-indicator.preview-ghost {
  opacity: 0.65;
  border: 1.5px dashed var(--color-primary) !important;
  pointer-events: none;
  z-index: 8;
  box-shadow: 0 0 8px rgba(255, 90, 31, 0.3);
  animation: pulse-ghost 1.2s infinite alternate ease-in-out;
}

@keyframes pulse-ghost {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 0.85;
  }
}

/* 4. Annotations Track */
.annotation-track .track-content {
  background-color: var(--color-track-annotation-light);
}

.annotation-indicator {
  position: absolute;
  top: 4px;
  height: 24px;
  background: var(--color-track-annotation);
  border-radius: var(--radius-sm);
  color: white;
  font-size: 8px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;
}

.annotation-indicator:hover {
  transform: translateY(-1px);
}

.annotation-indicator.selected {
  outline: 2px solid var(--color-primary);
}

.speed-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 700;
  border-radius: var(--radius-xs);
  background: var(--color-primary);
  color: white;
  z-index: 10;
}

.main-video-speed-badge {
  position: absolute;
  top: 6px;
  left: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.audio-speed-badge {
  position: absolute;
  top: 6px;
  left: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  z-index: 5;
}
</style>
