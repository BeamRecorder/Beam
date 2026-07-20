<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { Video, Volume2, Mic, MousePointer, Paintbrush } from '@lucide/vue';
import { useThumbnails } from './waveform/useThumbnails';
import Skeleton from '~/ui/skeleton/Skeleton.vue';

const props = defineProps<{
  currentTime: number;
  duration: number;
  zoomLevel: number;
  videoSrc: string | null;
  
  // Track toggle states
  isVideoEnabled: boolean;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:currentTime', value: number): void;
  (e: 'update:zoomLevel', value: number): void;
}>();

const tracksScrollRef = ref<HTMLDivElement | null>(null);
const tracksViewportRef = ref<HTMLDivElement | null>(null);

// Generate stable heights for simulated waveforms
const systemAudioWaveBars = computed(() => {
  const barCount = 120; // fixed count of bars to avoid overflow issues
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const height = 8 + Math.abs(Math.sin(i * 0.15)) * 18 + Math.abs(Math.cos(i * 0.4)) * 6;
    bars.push(height);
  }
  return bars;
});

const micAudioWaveBars = computed(() => {
  const barCount = 120;
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const height = 4 + Math.abs(Math.sin(i * 0.3)) * 15 + Math.abs(Math.cos(i * 0.6)) * 5;
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
const { thumbnails, requestVisibleFrames } = useThumbnails(props.videoSrc || '');

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

// Perform scrub calculation
const handleScrub = (e: MouseEvent) => {
  if (!tracksViewportRef.value) return;
  const rect = tracksViewportRef.value.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percentage = Math.max(0, Math.min(1, clickX / rect.width));
  emit('update:currentTime', percentage * props.duration);
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

// React to zoom level / video source changes
watch(() => [props.zoomLevel, props.videoSrc], () => {
  // Let DOM update width first, then request visible frames
  setTimeout(updateVisibleThumbnails, 50);
}, { immediate: true });

// Auto scroll timeline to follow playhead if zoomed in
watch(() => props.currentTime, (time) => {
  if (!tracksScrollRef.value || !tracksViewportRef.value || isDragging) return;
  
  const scrollContainer = tracksScrollRef.value;
  const viewport = tracksViewportRef.value;
  
  const percentage = time / props.duration;
  const playheadX = percentage * viewport.scrollWidth;
  
  const leftBound = scrollContainer.scrollLeft + 80;
  const rightBound = scrollContainer.scrollLeft + scrollContainer.clientWidth - 80;
  
  if (playheadX < leftBound || playheadX > rightBound) {
    scrollContainer.scrollLeft = playheadX - scrollContainer.clientWidth / 2;
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

      <!-- Tracks Stack -->
      <div class="tracks-stack">
        
        <!-- Video Track -->
        <div class="track-row video-track" :class="{ disabled: !isVideoEnabled }">
          <div class="track-info">
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
          <div class="track-info">
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
          <div class="track-info">
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

        <!-- Cursor Zooms Track (Future placeholder) -->
        <div class="track-row cursor-track">
          <div class="track-info">
            <MousePointer class="track-icon" />
            <span class="track-title">Cursors</span>
          </div>
          <div class="track-content cursor-content">
            <div class="cursor-zoom-indicator" :style="{ left: '25%', width: '15%' }">Cursor Zoom 1</div>
            <div class="cursor-zoom-indicator" :style="{ left: '60%', width: '10%' }">Cursor Zoom 2</div>
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
  height: 20px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  position: relative;
  cursor: ew-resize;
  user-select: none;
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
  bottom: 8px;
  transform: translateY(-50%);
}

.marker-tick {
  width: 1px;
  height: 4px;
  background-color: var(--color-border-strong);
}

.is-major .marker-tick {
  height: 8px;
  background-color: var(--color-border-dark);
}

/* Playhead */
.timeline-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-primary);
  z-index: 20;
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
