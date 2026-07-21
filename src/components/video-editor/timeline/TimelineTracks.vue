<script setup lang="ts">
import { computed, ref, onMounted, watch } from "vue";
import { Video, Volume2, Mic, MousePointer, Paintbrush } from "@lucide/vue";
import { useThumbnails } from "./waveform/useThumbnails";
import { useWaveform } from "./waveform/useWaveform";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import type { ZoomElement } from "../zoom/zoom-types";
import type { ProjectEditorData } from "../../../api/types/capture-api";

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
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:currentTime", value: number): void;
  (e: "update:zoomLevel", value: number): void;
  (e: "toggle:video"): void;
  (e: "toggle:systemAudio"): void;
  (e: "toggle:micAudio"): void;
  (e: "select:zoom", zoomId: string): void;
}>();

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

// Initialize thumbnail extraction composable
const { thumbnails, requestVisibleFrames } = useThumbnails(
  computed(() => props.videoSrc),
);

const ticksAreaRef = ref<HTMLDivElement | null>(null);

// Calculate tracks width based on zoom level (including 230px of margin breathing room)
const tracksWidthStyle = computed(() => {
  return {
    width: `calc(${props.zoomLevel}% + 230px)`,
    minWidth: "calc(100% + 230px)",
  };
});

// Calculate playhead position
const playheadStyle = computed(() => {
  const percentage = (props.currentTime / props.duration) * 100;
  return {
    left: `${percentage}%`,
  };
});

// Perform scrub calculation clamped between 0 and duration
const handleScrub = (e: MouseEvent) => {
  if (!ticksAreaRef.value) return;
  const rect = ticksAreaRef.value.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percentage = clickX / rect.width;
  const targetTime = percentage * props.duration;
  emit("update:currentTime", Math.max(0, Math.min(props.duration, targetTime)));
};

// Handle timeline scrubbing on drag
let isDragging = false;
const handleMouseDown = (e: MouseEvent) => {
  isDragging = true;
  handleScrub(e);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (isDragging) {
    handleScrub(e);
  }
};

const handleMouseUp = () => {
  isDragging = false;
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
  setTimeout(resetScrollPosition, 50);
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
        <!-- Video Track -->
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
          </div>
          <div class="track-content video-content">
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
          </div>
        </div>

        <!-- Audio System Track -->
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
          </div>
          <div class="track-content audio-content">
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
          </div>
        </div>

        <!-- Audio Microphone Track -->
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
            <span class="track-title">Microphone</span>
          </div>
          <div class="track-content audio-content">
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
          </div>
        </div>

        <!-- Zoom elements -->
        <div class="track-row cursor-track">
          <div class="track-info">
            <MousePointer class="track-icon" />
            <span class="track-title">Zooms</span>
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
              {{ [1.25, 1.5, 1.8, 2.2, 3.5, 5][element.depth - 1].toFixed(2) }}×
            </button>
          </div>
        </div>

        <!-- Annotations Track (Future placeholder) -->
        <div class="track-row annotation-track">
          <div class="track-info">
            <Paintbrush class="track-icon" />
            <span class="track-title">Draw</span>
          </div>
          <div class="track-content annotation-content">
            <div
              class="annotation-indicator"
              :style="{ left: '40%', width: '20%' }"
            >
              Arrow Pen Draw
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
  width: 2px;
  background: var(--color-primary);
  z-index: 5;
  pointer-events: none;
  height: 200px; /* Stretch through all tracks */
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
}
</style>
