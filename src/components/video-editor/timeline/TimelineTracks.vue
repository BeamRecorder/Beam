<script setup lang="ts">
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
} from "@lucide/vue";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import Button from "~/ui/button/Button.vue";
import type { ZoomElement } from "../zoom/zoom-types";
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { ProjectComposition } from "../composition/composition-types";
import { useTimelineTracks } from "./composables/useTimelineTracks";

const props = defineProps<{
  currentTime: number;
  duration: number;
  zoomLevel: number;
  videoSrc: string | null;
  editorData?: ProjectEditorData | null;

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
  (e: "select:camera-layer", layerId: string): void;
  (e: "toggle:camera"): void;
  (e: "toggle:camera-layer"): void;
  (e: "split:camera"): void;
  (e: "trim:camera", edge: "start" | "end"): void;
  (e: "unlink"): void;
  (e: "unlink-track", trackKind: string): void;
  (e: "move:clip", payload: { id: string; deltaMs: number }): void;
  (
    e: "trim:clip-edge",
    payload: { id: string; edge: "start" | "end"; timeMs: number },
  ): void;
}>();

const {
  captionLayers,
  imageLayers,
  cameraLayers,
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
} = useTimelineTracks(props, emit);

const selectMainVideoLayer = () => {
  if (mainVideoLayer.value) {
    emit("select:composition-layer", mainVideoLayer.value.id);
  }
};

(void tracksScrollRef, tracksViewportRef, ticksAreaRef);
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
          <div
            v-for="sec in duration + 1"
            :key="sec"
            class="ruler-marker"
            :class="{ 'is-major': (sec - 1) % 5 === 0 }"
            :style="{ left: `${((sec - 1) / duration) * 100}%` }"
          >
            <span v-if="(sec - 1) % 5 === 0" class="marker-label"
              >{{ sec - 1 }}s</span
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
          :class="{ disabled: !isVideoEnabled }"
        >
          <div
            class="track-info"
            @click="emit('toggle:video')"
            title="Click to toggle Video track"
          >
            <Video class="track-icon" />
            <span class="track-title">Video</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              tooltip="Unlink Video track"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'video')"
            />
          </div>
          <div
            class="track-content video-content"
            :class="{
              selected:
                mainVideoLayer &&
                selectedCompositionLayerId === mainVideoLayer.id,
            }"
            @click.stop="selectMainVideoLayer"
          >
            <!-- Virtualized Thumbnails Container -->
            <div class="thumbnails-track">
              <div
                v-for="sec in duration"
                :key="sec"
                class="thumbnail-frame"
                :style="{ width: `${100 / duration}%` }"
              >
                <img
                  v-if="thumbnails[sec - 1]"
                  :src="thumbnails[sec - 1]"
                  class="thumbnail-img"
                  alt="frame"
                />
                <Skeleton v-else width="100%" height="100%" radius="0" />
              </div>
            </div>
            <!-- Render Image / Media Overlay Clips -->
            <button
              v-for="layer in imageLayers"
              :key="layer.id"
              type="button"
              class="image-clip"
              :class="{ selected: layer.id === selectedCompositionLayerId }"
              :style="layerStyle(layer.startMs, layer.endMs)"
              @click.stop="emit('select:composition-layer', layer.id)"
            >
              <span class="clip-label-overlay">🖼️ {{ layer.name }}</span>
              <span class="trim-handle start"></span>
              <span class="trim-handle end"></span>
            </button>
            <!-- Clip Trim Handles -->
            <div class="trim-handle start" title="Trim start (drag)"></div>
            <div class="trim-handle end" title="Trim end (drag)"></div>
          </div>
        </div>

        <!-- 1b. Webcam sidecar track -->
        <div
          v-if="cameraLayers.length"
          class="track-row camera-track"
          :class="{ disabled: !isCameraEnabled }"
        >
          <div
            class="track-info"
            @click="emit('toggle:camera')"
            title="Show or hide webcam track"
          >
            <component
              :is="isCameraEnabled ? Eye : EyeOff"
              class="track-icon"
            />
            <span class="track-title">Webcam</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              tooltip="Unlink Webcam track"
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
            >
              <div class="thumbnails-track">
                <div
                  v-for="sec in duration"
                  :key="sec"
                  class="thumbnail-frame"
                  :style="{ width: `${100 / duration}%` }"
                >
                  <img
                    v-if="webcamThumbnails[sec - 1]"
                    :src="webcamThumbnails[sec - 1]"
                    class="thumbnail-img"
                    alt="webcam frame"
                  />
                  <Skeleton v-else width="100%" height="100%" radius="0" />
                </div>
              </div>
              <span class="clip-label-overlay">Webcam</span>
              <span class="trim-handle start" title="Trim start"></span>
              <span class="trim-handle end" title="Trim end"></span>
            </button>
            <div
              v-if="selectedCameraLayerId"
              class="camera-actions"
              @click.stop
            >
              <button
                type="button"
                title="Split webcam at playhead"
                @click="emit('split:camera')"
              >
                <Scissors :size="13" />
              </button>
              <button
                type="button"
                title="Show or hide selected webcam clip"
                @click="emit('toggle:camera-layer')"
              >
                <EyeOff :size="13" />
              </button>
              <button
                type="button"
                title="Trim webcam start to playhead"
                @click="emit('trim:camera', 'start')"
              >
                <MoveLeft :size="13" />
              </button>
              <button
                type="button"
                title="Trim webcam end to playhead"
                @click="emit('trim:camera', 'end')"
              >
                <MoveRight :size="13" />
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Cursor / Zooms Track (Must be placed strictly below all video/image/webcam tracks) -->
        <div class="track-row cursor-track">
          <div class="track-info">
            <MousePointer class="track-icon" />
            <span class="track-title">Zooms</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              tooltip="Unlink Zooms track"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'zooms')"
            />
          </div>
          <div
            class="track-content cursor-content"
            title="Click to add zoom at position"
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
              + Add 1.5× Zoom
            </div>

            <button
              v-for="element in zoomElements"
              :key="element.id"
              type="button"
              class="cursor-zoom-indicator"
              :class="{ selected: element.id === selectedZoomId }"
              :style="zoomElementStyle(element)"
              :title="`Zoom ${[1.25, 1.5, 1.8, 2.2, 3.5, 5][element.depth - 1].toFixed(2)}×`"
              @click.stop="emit('select:zoom', element.id)"
            >
              <span class="trim-handle start"></span>
              {{ [1.25, 1.5, 1.8, 2.2, 3.5, 5][element.depth - 1].toFixed(2) }}×
              <span class="trim-handle end"></span>
            </button>
          </div>
        </div>

        <!-- 3. Captions / Annotations Track (Below cursor/zooms) -->
        <div class="track-row annotation-track">
          <div class="track-info">
            <Type class="track-icon" />
            <span class="track-title">Captions</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              tooltip="Unlink Captions track"
              tooltip-position="right"
              class="track-unlink-btn"
              @click.stop="emit('unlink-track', 'captions')"
            />
          </div>
          <div
            class="track-content annotation-content"
            title="Click to add caption at position"
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
              + Add Caption
            </div>

            <button
              v-for="layer in captionLayers"
              :key="layer.id"
              type="button"
              class="annotation-indicator"
              :class="{ selected: layer.id === selectedCompositionLayerId }"
              :style="layerStyle(layer.startMs, layer.endMs)"
              @click.stop="emit('select:composition-layer', layer.id)"
            >
              <span class="trim-handle start"></span>
              {{ layer.name }}
              <span class="trim-handle end"></span>
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
            title="Click to toggle System Audio track"
          >
            <Volume2 class="track-icon" />
            <span class="track-title">System</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              tooltip="Unlink System Audio track"
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
            title="Click to toggle Microphone track"
          >
            <Mic class="track-icon" />
            <span class="track-title">Mic</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="Unlink"
              tooltip="Unlink Microphone track"
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-tracks-container {
  width: 100%;
  overflow-x: auto;
  background: var(--color-bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  position: relative;
}

.timeline-viewport {
  position: relative;
  display: flex;
  flex-direction: column;
}
.camera-content {
  position: relative;
  height: 100%;
  background: var(--color-bg-element);
}
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
  bottom: 0;
  left: 0;
  width: 2px;
  background: var(--color-primary);
  z-index: 5;
  pointer-events: none;
  height: 200px; /* Stretch through all tracks */
  will-change: transform;
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

/* Slim Track Row */
.track-row {
  display: flex;
  align-items: center;
  height: 32px; /* Fine/thin track rows as requested */
  background: var(--color-bg-element);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  position: relative;
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
}

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
  display: flex;
  width: 100%;
  height: 100%;
}

.thumbnail-frame {
  height: 100%;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  position: relative;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
</style>
