<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { Video, Volume2, Mic, MousePointer, Paintbrush } from '@lucide/vue';
import { useThumbnails } from './waveform/useThumbnails';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import type { ZoomElement } from '../zoom/zoom-types';

const props = defineProps<{
  currentTime: number;
  duration: number;
  zoomLevel: number;
  videoSrc: string | null;
  
  // Track toggle states
  isVideoEnabled: boolean;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:currentTime', value: number): void;
  (e: 'update:zoomLevel', value: number): void;
  (e: 'toggle:video'): void;
  (e: 'toggle:systemAudio'): void;
  (e: 'toggle:micAudio'): void;
  (e: 'select:zoom', zoomId: string): void;
}>();

const zoomElementStyle = (element: ZoomElement) => ({
  left: `${props.duration > 0 ? (element.startMs / 1000 / props.duration) * 100 : 0}%`,
  width: `${props.duration > 0 ? ((element.endMs - element.startMs) / 1000 / props.duration) * 100 : 0}%`,
});

const tracksScrollRef = ref<HTMLDivElement | null>(null);
const tracksViewportRef = ref<HTMLDivElement | null>(null);

// Generate stable heights for simulated waveforms with realistic envelopes & pauses
const systemAudioWaveBars = computed(() => {
  const barCount = 120;
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const progress = i / barCount;
    // Fade in at start, fade out at end
    let envelope = 1;
    if (progress < 0.08) {
      envelope = progress / 0.08;
    } else if (progress > 0.92) {
      envelope = (1 - progress) / 0.08;
    }
    // Sentence word bursts (pauses every now and then)
    const sentenceWave = Math.sin(progress * Math.PI * 6);
    const wordGap = sentenceWave > -0.3 ? 1.0 : 0.15;
    
    const height = 4 + (Math.abs(Math.sin(i * 0.25)) * 16 + Math.abs(Math.cos(i * 0.5)) * 6) * envelope * wordGap;
    bars.push(height);
  }
  return bars;
});

const micAudioWaveBars = computed(() => {
  const barCount = 120;
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const progress = i / barCount;
    // Different fade points and pauses to look unique
    let envelope = 1;
    if (progress < 0.12) {
      envelope = progress / 0.12;
    } else if (progress > 0.88) {
      envelope = (1 - progress) / 0.12;
    }
    const sentenceWave = Math.sin(progress * Math.PI * 8 + 1);
    const wordGap = sentenceWave > -0.15 ? 1.0 : 0.1;
    
    const height = 3 + (Math.abs(Math.sin(i * 0.4)) * 14 + Math.abs(Math.cos(i * 0.75)) * 5) * envelope * wordGap;
    bars.push(height);
  }
  return bars;
});

// Handle Ctrl + Wheel Zoom
const handleWheel = (e: WheelEvent) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 15 : -15;
    const newZoom = Math.max(100, Math.min(500, props.zoomLevel + zoomDelta));
    emit('update:zoomLevel', newZoom);
  }
};

// Initialize thumbnail extraction composable
const { thumbnails, requestVisibleFrames } = useThumbnails(computed(() => props.videoSrc));

const ticksAreaRef = ref<HTMLDivElement | null>(null);

// Calculate tracks width based on zoom level
const tracksWidthStyle = computed(() => {
  return {
    width: `${props.zoomLevel}%`,
    minWidth: '100%'
  };
});

// Calculate playhead position
const playheadStyle = computed(() => {
  const percentage = (props.currentTime / props.duration) * 100;
  return {
    left: `${percentage}%`
  };
});

// Perform scrub calculation clamped between 0 and duration
const handleScrub = (e: MouseEvent) => {
  if (!ticksAreaRef.value) return;
  const rect = ticksAreaRef.value.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percentage = clickX / rect.width;
  const targetTime = percentage * props.duration;
  emit('update:currentTime', Math.max(0, Math.min(props.duration, targetTime)));
};

// Handle timeline scrubbing on drag
let isDragging = false;
const handleMouseDown = (e: MouseEvent) => {
  isDragging = true;
  handleScrub(e);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (isDragging) {
    handleScrub(e);
  }
};

const handleMouseUp = () => {
  isDragging = false;
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
};

// Virtualization: determine which frame seconds are visible and request them
const updateVisibleThumbnails = () => {
  if (!tracksScrollRef.value || !tracksViewportRef.value || !props.videoSrc) return;
  
  const scrollLeft = tracksScrollRef.value.scrollLeft;
  const clientWidth = tracksScrollRef.value.clientWidth;
  const scrollWidth = tracksViewportRef.value.scrollWidth;

  const startPercent = scrollLeft / scrollWidth;
  const endPercent = (scrollLeft + clientWidth) / scrollWidth;

  const startSecond = Math.max(0, Math.floor(startPercent * props.duration));
  const endSecond = Math.min(props.duration, Math.ceil(endPercent * props.duration));

  // Request visible frame timestamps (extract 1 frame per second for timeline view)
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
watch(() => [props.zoomLevel, props.videoSrc, props.duration], () => {
  // Let DOM update width first, then request visible frames
  setTimeout(updateVisibleThumbnails, 50);
}, { immediate: true });

// Auto scroll timeline to follow playhead if zoomed in
watch(() => props.currentTime, (time) => {
  if (!tracksScrollRef.value || !ticksAreaRef.value || isDragging) return;
  
  const scrollContainer = tracksScrollRef.value;
  const ticksArea = ticksAreaRef.value;
  
  const percentage = time / props.duration;
  const playheadX = 120 + percentage * ticksArea.clientWidth;
  
  const leftBound = scrollContainer.scrollLeft + 80;
  const rightBound = scrollContainer.scrollLeft + scrollContainer.clientWidth - 80;
  
  if (playheadX < leftBound || playheadX > rightBound) {
    scrollContainer.scrollTo({
      left: playheadX - scrollContainer.clientWidth / 2,
      behavior: 'smooth'
    });
  }
});

onMounted(() => {
  updateVisibleThumbnails();
});
</script>

<template>
  <div class="timeline-tracks-container" ref="tracksScrollRef" @scroll="onScroll" @wheel="handleWheel">
    <div class="timeline-viewport" ref="tracksViewportRef" :style="tracksWidthStyle">
      
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
            <span v-if="(sec - 1) % 5 === 0" class="marker-label">{{ sec - 1 }}s</span>
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
        <div class="track-row video-track" :class="{ disabled: !isVideoEnabled }">
          <div class="track-info" @click="emit('toggle:video')" title="Click to toggle Video track">
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
        <div class="track-row audio-track" :class="{ disabled: !isSystemAudioEnabled }">
          <div class="track-info" @click="emit('toggle:systemAudio')" title="Click to toggle System Audio track">
            <Volume2 class="track-icon" />
            <span class="track-title">System</span>
          </div>
          <div class="track-content audio-content">
            <div class="audio-block">
              <!-- Waveform bars representation -->
              <div class="audio-waveform-simulated">
                <div v-for="(height, index) in systemAudioWaveBars" :key="index" class="wave-bar" :style="{ height: `${height}px` }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Audio Microphone Track -->
        <div class="track-row audio-track" :class="{ disabled: !isMicAudioEnabled }">
          <div class="track-info" @click="emit('toggle:micAudio')" title="Click to toggle Microphone track">
            <Mic class="track-icon" />
            <span class="track-title">Microphone</span>
          </div>
          <div class="track-content audio-content">
            <div class="audio-block">
              <div class="audio-waveform-simulated">
                <div v-for="(height, index) in micAudioWaveBars" :key="index" class="wave-bar" :style="{ height: `${height}px` }"></div>
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
              :title="`Zoom ${element.scale.toFixed(2)}×`"
              @click.stop="emit('select:zoom', element.id)"
            >
              {{ element.scale.toFixed(2) }}×
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
            <div class="annotation-indicator" :style="{ left: '40%', width: '20%' }">Arrow Pen Draw</div>
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
