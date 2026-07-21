<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { Video, Volume2, Mic, MousePointer, Type, Scissors, MoveLeft, MoveRight, Eye, EyeOff, Unlink } from "@lucide/vue";
import { useThumbnails } from "./waveform/useThumbnails";
import { useWaveform } from "./waveform/useWaveform";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import Button from "~/ui/button/Button.vue";
import type { ZoomElement } from "../zoom/zoom-types";
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { ProjectComposition } from '../composition/composition-types'

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
  (e: "trim:camera", edge: 'start' | 'end'): void;
  (e: "unlink"): void;
  (e: "unlink-track", trackKind: string): void;
  (e: "move:clip", payload: { id: string; deltaMs: number }): void;
  (e: "trim:clip-edge", payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
}>();

const captionLayers = computed(() => props.composition.layers.filter((layer) => layer.kind === 'caption'))
const imageLayers = computed(() => props.composition.layers.filter((layer) => layer.kind === 'image'))
const cameraAssetIds = computed(() => new Set(props.composition.media.filter((asset) => asset.origin === 'session' && asset.kind === 'video').map((asset) => asset.id)))
const cameraLayers = computed(() => props.composition.layers.filter((layer) => layer.kind === 'video' && cameraAssetIds.value.has(layer.assetId)))
const mainVideoLayer = computed(() => props.composition.layers.find((layer) => layer.kind === 'video' && !cameraAssetIds.value.has(layer.assetId)) ?? props.composition.layers[0] ?? null)
const layerStyle = (startMs: number, endMs: number) => ({ left: `${props.duration > 0 ? startMs / (props.duration * 10) : 0}%`, width: `${props.duration > 0 ? (endMs - startMs) / (props.duration * 10) : 0}%` })

const zoomElementStyle = (element: ZoomElement) => ({
  left: `${props.duration > 0 ? (element.startMs / 1000 / props.duration) * 100 : 0}%`,
  width: `${props.duration > 0 ? ((element.endMs - element.startMs) / 1000 / props.duration) * 100 : 0}%`,
});

const tracksScrollRef = ref<HTMLDivElement | null>(null);
const tracksViewportRef = ref<HTMLDivElement | null>(null);

const micAudioWaveBars = computed(() => {
  const barCount = 120;
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const progress = i / barCount;
    let envelope = 1;
    if (progress < 0.12) {
      envelope = progress / 0.12;
    } else if (progress > 0.88) {
      envelope = (1 - progress) / 0.12;
    }
    const sentenceWave = Math.sin(progress * Math.PI * 8 + 1);
    const wordGap = sentenceWave > -0.15 ? 1.0 : 0.1;

    const height =
      3 +
      (Math.abs(Math.sin(i * 0.4)) * 14 + Math.abs(Math.cos(i * 0.75)) * 5) *
        envelope *
        wordGap;
    bars.push(height);
  }
  return bars;
});

// Real Waveform Logic
const { peaks: systemPeaks, generateWaveformFromAudioBuffer: genSystemWaveform } =
  useWaveform();
const { peaks: micPeaks, generateWaveformFromAudioBuffer: genMicWaveform } =
  useWaveform();

const systemAudioBuffer = ref<AudioBuffer | null>(null);
const micAudioBuffer = ref<AudioBuffer | null>(null);

const decodeAudio = async (source: string) => {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to read audio asset: ${source}`);
  const context = new OfflineAudioContext(1, 1, 44_100);
  return context.decodeAudioData(await response.arrayBuffer());
};

const visibleStartSecond = ref(0);
const visibleEndSecond = ref(0);

const systemAudioTrack = computed(() =>
  props.editorData?.tracks.find((t) => t.kind === "system-audio"),
);
const micAudioTrack = computed(() =>
  props.editorData?.tracks.find((t) => t.kind === "microphone"),
);

// Fetch audio files once when tracks are loaded
watch(
  () => systemAudioTrack.value?.assets?.[0]?.src,
  async (src) => {
    if (!src) {
      systemAudioBuffer.value = null;
      return;
    }
    try {
      systemAudioBuffer.value = await decodeAudio(src);
    } catch (err) {
      console.error("Failed to load system audio track:", err);
    }
  },
  { immediate: true },
);

watch(
  () => micAudioTrack.value?.assets?.[0]?.src,
  async (src) => {
    if (!src) {
      micAudioBuffer.value = null;
      return;
    }
    try {
      micAudioBuffer.value = await decodeAudio(src);
    } catch (err) {
      console.error("Failed to load mic audio track:", err);
    }
  },
  { immediate: true },
);

const getNormalizedBars = (peaks: Float32Array | null, maxBarHeight = 22) => {
  if (!peaks || peaks.length === 0) return [];
  const len = peaks.length / 2;
  const amps = new Float32Array(len);
  let maxAmp = 0.0001; // Avoid divide-by-zero

  for (let i = 0; i < len; i++) {
    const min = peaks[i * 2];
    const max = peaks[i * 2 + 1];
    const amp = Math.max(0, max - min);
    amps[i] = amp;
    if (amp > maxAmp) maxAmp = amp;
  }

  // Scale bars relative to max amplitude in track so quiet mic signals are visible & dynamic
  const bars: number[] = [];
  const scale = maxAmp > 0.01 ? maxBarHeight / maxAmp : maxBarHeight * 5; // boost if very low signal

  for (let i = 0; i < len; i++) {
    const height = Math.max(2, Math.min(maxBarHeight, Math.round(amps[i] * scale)));
    bars.push(height);
  }
  return bars;
};

const systemBars = computed(() => getNormalizedBars(systemPeaks.value));
const micBars = computed(() => getNormalizedBars(micPeaks.value));

const waveformStyle = computed(() => {
  return {
    position: "absolute" as const,
    left: "0%",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "2px",
  };
});

const updateWaveforms = () => {
  if (!props.duration || props.duration <= 0) return;

  // Set number of target points based on track scrollable width or default resolution
  const width = tracksViewportRef.value?.clientWidth || 1000;
  const targetPoints = Math.max(100, Math.min(1200, Math.floor(width / 3)));

  if (systemAudioBuffer.value) {
    genSystemWaveform(systemAudioBuffer.value, 0, props.duration, targetPoints);
  }
  if (micAudioBuffer.value) {
    genMicWaveform(micAudioBuffer.value, 0, props.duration, targetPoints);
  }
};

watch(
  () => [
    systemAudioBuffer.value,
    micAudioBuffer.value,
    props.duration,
    props.zoomLevel,
  ],
  () => {
    updateWaveforms();
  },
);

// Handle Ctrl + Wheel Zoom
const handleWheel = (e: WheelEvent) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 15 : -15;
    const newZoom = Math.max(100, Math.min(500, props.zoomLevel + zoomDelta));
    emit("update:zoomLevel", newZoom);
  }
};

const cameraMediaSrc = computed(() => {
  const layer = cameraLayers.value[0];
  if (!layer || !('assetId' in layer)) return null;
  const asset = props.composition.media.find((m) => m.id === layer.assetId);
  return asset?.src ?? null;
});

// Initialize thumbnail extraction composables
const { thumbnails, requestVisibleFrames } = useThumbnails(
  computed(() => props.videoSrc),
);

const { thumbnails: webcamThumbnails, requestVisibleFrames: requestWebcamFrames } = useThumbnails(
  cameraMediaSrc,
);

const ticksAreaRef = ref<HTMLDivElement | null>(null);

// Calculate tracks width based on zoom level (including 230px of margin breathing room)
const tracksWidthStyle = computed(() => {
  return {
    width: `calc(${props.zoomLevel}% + 230px)`,
    minWidth: "calc(100% + 230px)",
  };
});

const ticksAreaWidth = ref(0);
let ticksResizeObserver: ResizeObserver | null = null;

const updateTicksWidth = () => {
  if (ticksAreaRef.value) {
    ticksAreaWidth.value = ticksAreaRef.value.clientWidth;
  }
};

// Calculate playhead position using translate3d for GPU compositing
const playheadStyle = computed(() => {
  const percentage = props.duration > 0 ? props.currentTime / props.duration : 0;
  const x = percentage * ticksAreaWidth.value;
  return {
    transform: `translate3d(${x}px, 0, 0)`,
  };
});

// Perform scrub calculation clamped between 0 and duration
let isDragging = false;
let dragRect: { left: number; width: number } | null = null;
let rafId: number | null = null;

const handleScrub = (clientX: number) => {
  if (!ticksAreaRef.value || !props.duration) return;
  const rect = dragRect || ticksAreaRef.value.getBoundingClientRect();
  if (rect.width <= 0) return;
  const clickX = clientX - rect.left;
  const percentage = clickX / rect.width;
  const targetTime = percentage * props.duration;
  emit("update:currentTime", Math.max(0, Math.min(props.duration, targetTime)));
};

// Handle timeline scrubbing on drag
const handleMouseDown = (e: MouseEvent) => {
  isDragging = true;
  if (ticksAreaRef.value) {
    const rect = ticksAreaRef.value.getBoundingClientRect();
    dragRect = { left: rect.left, width: rect.width };
  }
  handleScrub(e.clientX);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging) return;
  const clientX = e.clientX;
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (isDragging) {
      handleScrub(clientX);
    }
  });
};

const handleMouseUp = () => {
  isDragging = false;
  dragRect = null;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
};

// Virtualization: determine which frame seconds are visible and request them
const updateVisibleThumbnails = () => {
  if (!tracksScrollRef.value || !tracksViewportRef.value || !props.videoSrc)
    return;

  const scrollLeft = tracksScrollRef.value.scrollLeft;
  const clientWidth = tracksScrollRef.value.clientWidth;
  const scrollWidth = tracksViewportRef.value.scrollWidth;

  const startPercent = scrollLeft / scrollWidth;
  const endPercent = (scrollLeft + clientWidth) / scrollWidth;

  const startSecond = Math.max(0, Math.floor(startPercent * props.duration));
  const endSecond = Math.min(
    Math.max(0, props.duration - 1),
    Math.ceil(endPercent * props.duration),
  );

  visibleStartSecond.value = startSecond;
  visibleEndSecond.value = endSecond;

  // Request visible frame timestamps (extract 1 frame per second for timeline view: 0, 1, ..., duration - 1)
  const visibleSeconds: number[] = [];
  for (let s = startSecond; s <= endSecond; s++) {
    visibleSeconds.push(s);
  }

  if (visibleSeconds.length > 0) {
    requestVisibleFrames(visibleSeconds);
    if (cameraMediaSrc.value) {
      requestWebcamFrames(visibleSeconds);
    }
  }
};

const onScroll = () => {
  updateVisibleThumbnails();
};

// React to zoom level / video source / duration changes
watch(
  () => [props.zoomLevel, props.videoSrc, props.duration],
  () => {
    // Let DOM update width first, then request visible frames
    setTimeout(updateVisibleThumbnails, 50);
  },
  { immediate: true },
);

// Auto scroll timeline to follow playhead if zoomed in
watch(
  () => props.currentTime,
  (time) => {
    if (!tracksScrollRef.value || !ticksAreaRef.value || isDragging) return;

    const scrollContainer = tracksScrollRef.value;
    const ticksArea = ticksAreaRef.value;

    const percentage = time / props.duration;
    const playheadX = 120 + percentage * ticksArea.clientWidth;

    const leftBound = scrollContainer.scrollLeft + 80;
    const rightBound =
      scrollContainer.scrollLeft + scrollContainer.clientWidth - 80;

    if (playheadX < leftBound || playheadX > rightBound) {
      scrollContainer.scrollTo({
        left: playheadX - scrollContainer.clientWidth / 2,
        behavior: "smooth",
      });
    }
  },
);

const resetScrollPosition = () => {
  if (tracksScrollRef.value) {
    tracksScrollRef.value.scrollLeft = 80;
  }
};

onMounted(() => {
  updateVisibleThumbnails();
  updateTicksWidth();
  if (ticksAreaRef.value) {
    ticksResizeObserver = new ResizeObserver(updateTicksWidth);
    ticksResizeObserver.observe(ticksAreaRef.value);
  }
  setTimeout(resetScrollPosition, 50);
});

onUnmounted(() => {
  ticksResizeObserver?.disconnect();
  handleMouseUp();
});

watch(
  () => props.videoSrc,
  () => {
    setTimeout(resetScrollPosition, 50);
  },
);
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
            :class="{ selected: mainVideoLayer && selectedCompositionLayerId === mainVideoLayer.id }"
            @click.stop="mainVideoLayer && emit('select:composition-layer', mainVideoLayer.id)"
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
              <span class="trim-handle start" />
              <span class="trim-handle end" />
            </button>
            <!-- Clip Trim Handles -->
            <div class="trim-handle start" title="Trim start (drag)" />
            <div class="trim-handle end" title="Trim end (drag)" />
          </div>
        </div>

        <!-- 1b. Webcam sidecar track -->
        <div v-if="cameraLayers.length" class="track-row camera-track" :class="{ disabled: !isCameraEnabled }">
          <div class="track-info" @click="emit('toggle:camera')" title="Show or hide webcam track">
            <component :is="isCameraEnabled ? Eye : EyeOff" class="track-icon" />
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
            <button v-for="layer in cameraLayers" :key="layer.id" type="button" class="camera-clip" :class="{ selected: layer.id === selectedCameraLayerId, disabled: !layer.enabled }" :style="layerStyle(layer.startMs, layer.endMs)" @click.stop="emit('select:camera-layer', layer.id)">
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
              <span class="trim-handle start" title="Trim start" />
              <span class="trim-handle end" title="Trim end" />
            </button>
            <div v-if="selectedCameraLayerId" class="camera-actions" @click.stop>
              <button type="button" title="Split webcam at playhead" @click="emit('split:camera')"><Scissors :size="13" /></button>
              <button type="button" title="Show or hide selected webcam clip" @click="emit('toggle:camera-layer')"><EyeOff :size="13" /></button>
              <button type="button" title="Trim webcam start to playhead" @click="emit('trim:camera', 'start')"><MoveLeft :size="13" /></button>
              <button type="button" title="Trim webcam end to playhead" @click="emit('trim:camera', 'end')"><MoveRight :size="13" /></button>
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
          <div class="track-content cursor-content">
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
              <span class="trim-handle start" />
              {{ [1.25, 1.5, 1.8, 2.2, 3.5, 5][element.depth - 1].toFixed(2) }}×
              <span class="trim-handle end" />
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
          <div class="track-content annotation-content">
            <button v-for="layer in captionLayers" :key="layer.id" type="button" class="annotation-indicator" :class="{ selected: layer.id === selectedCompositionLayerId }" :style="layerStyle(layer.startMs, layer.endMs)" @click.stop="emit('select:composition-layer', layer.id)">
              <span class="trim-handle start" />
              {{ layer.name }}
              <span class="trim-handle end" />
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
            <div class="trim-handle start" />
            <div class="trim-handle end" />
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
            <div class="trim-handle start" />
            <div class="trim-handle end" />
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
.camera-content { position: relative; background: color-mix(in srgb, var(--color-primary-light) 36%, transparent); }
.camera-clip { position: absolute; top: 2px; bottom: 2px; border: 1px solid var(--color-primary); border-radius: var(--radius-sm); background: var(--color-primary-light); color: var(--color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: inherit; font-size: 11px; cursor: pointer; padding: 0; }
.clip-label-overlay { position: absolute; left: 8px; top: 2px; font-size: 9px; font-weight: 800; background: rgba(0, 0, 0, 0.6); color: white; padding: 1px 5px; border-radius: var(--radius-sm); z-index: 5; pointer-events: none; }
.camera-clip.selected { box-shadow: 0 0 0 2px var(--color-primary); }
.camera-clip.disabled { opacity: .38; text-decoration: line-through; }
.camera-actions { position: absolute; right: 8px; top: 4px; display: flex; gap: 4px; }
.camera-actions button { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-element); color: var(--text-primary); cursor: pointer; }
.camera-actions button:hover { color: var(--color-primary); border-color: var(--color-primary); }

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
  cursor: pointer;
  position: relative;
}

.video-track .track-content::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  border-radius: var(--radius-sm);
  border: 2px solid transparent;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.video-track .track-content:hover::after {
  border-color: var(--color-primary);
  background-color: rgba(255, 90, 31, 0.08);
}

.video-track .track-content.selected::after {
  border-color: var(--color-primary);
  box-shadow: inset 0 0 0 1px var(--color-primary);
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
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.audio-track .track-content:hover {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.audio-track .track-content.selected {
  box-shadow: inset 0 0 0 2px var(--color-primary);
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
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.cursor-zoom-indicator:hover {
  transform: translateY(-1px);
  border-color: white;
}

.cursor-zoom-indicator.selected {
  border-color: white;
  outline: 2px solid var(--color-primary);
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
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.annotation-indicator:hover {
  transform: translateY(-1px);
}

.annotation-indicator.selected {
  outline: 2px solid var(--color-primary);
}
</style>
