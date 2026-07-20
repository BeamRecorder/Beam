<script setup lang="ts">
import { computed, ref } from 'vue'
import { Video, Volume2, Mic, Play, Pause, Scissors } from '@lucide/vue'
import Slider from '~/ui/slider/Slider.vue'
import Switch from '~/ui/switch/Switch.vue'

const props = defineProps<{
  currentTime: number
  duration: number
  isPlaying: boolean
  
  // Track states
  isVideoEnabled: boolean
  isSystemAudioEnabled: boolean
  isMicAudioEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'update:currentTime', value: number): void
  (e: 'update:isPlaying', value: boolean): void
  (e: 'update:isVideoEnabled', value: boolean): void
  (e: 'update:isSystemAudioEnabled', value: boolean): void
  (e: 'update:isMicAudioEnabled', value: boolean): void
}>()

const timelineRef = ref<HTMLDivElement | null>(null)

// Handle scrubbing click on track timeline
const onTimelineClick = (e: MouseEvent) => {
  if (!timelineRef.value) return
  const rect = timelineRef.value.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const percentage = Math.max(0, Math.min(1, clickX / rect.width))
  emit('update:currentTime', percentage * props.duration)
}

const playheadStyle = computed(() => {
  const percentage = (props.currentTime / props.duration) * 100
  return {
    left: `${percentage}%`
  }
})
</script>

<template>
  <div class="timeline-island">
    <!-- Controls row -->
    <div class="timeline-controls-row">
      <div class="left-controls">
        <button class="icon-btn" @click="emit('update:isPlaying', !isPlaying)">
          <Play v-if="!isPlaying" class="btn-icon" />
          <Pause v-else class="btn-icon" />
        </button>
        <button class="icon-btn" title="Split track">
          <Scissors class="btn-icon" />
        </button>
      </div>
      
      <div class="time-display">
        <span class="curr-time">{{ Math.floor(currentTime).toString().padStart(2, '0') }}s</span>
        <span class="divider">/</span>
        <span class="total-time">{{ duration }}s</span>
      </div>
    </div>

    <!-- Tracks Container -->
    <div class="tracks-area">
      <!-- Ruler/Header -->
      <div class="tracks-ruler" ref="timelineRef" @mousedown="onTimelineClick">
        <!-- Ruler markers -->
        <div 
          v-for="sec in duration + 1" 
          v-show="sec % 5 === 0"
          :key="sec" 
          class="ruler-marker"
          :style="{ left: `${(sec / duration) * 100}%` }"
        >
          {{ sec }}s
        </div>
        
        <!-- Playhead vertical indicator line -->
        <div class="timeline-playhead" :style="playheadStyle">
          <div class="playhead-knob"></div>
        </div>
      </div>

      <!-- Video Track -->
      <div class="track-row" :class="{ disabled: !isVideoEnabled }">
        <div class="track-info">
          <Video class="track-icon" />
          <span class="track-title">Video</span>
          <Switch 
            :model-value="isVideoEnabled" 
            @update:modelValue="emit('update:isVideoEnabled', $event)" 
          />
        </div>
        <div class="track-content video-content">
          <div class="track-block">Recorded Screen Content</div>
        </div>
      </div>

      <!-- System Audio Track -->
      <div class="track-row" :class="{ disabled: !isSystemAudioEnabled }">
        <div class="track-info">
          <Volume2 class="track-icon" />
          <span class="track-title">System Audio</span>
          <Switch 
            :model-value="isSystemAudioEnabled" 
            @update:modelValue="emit('update:isSystemAudioEnabled', $event)" 
          />
        </div>
        <div class="track-content audio-content sys-audio">
          <div class="waveform-wave"></div>
        </div>
      </div>

      <!-- Mic Audio Track -->
      <div class="track-row" :class="{ disabled: !isMicAudioEnabled }">
        <div class="track-info">
          <Mic class="track-icon" />
          <span class="track-title">Microphone</span>
          <Switch 
            :model-value="isMicAudioEnabled" 
            @update:modelValue="emit('update:isMicAudioEnabled', $event)" 
          />
        </div>
        <div class="track-content audio-content mic-audio">
          <div class="waveform-wave wave-alt"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-island {
  width: 100%;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 8px;
}

.left-controls {
  display: flex;
  gap: 8px;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: var(--color-light-blue-hover);
  color: var(--text-primary);
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.time-display {
  font-size: 13px;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-secondary);
}

.divider {
  margin: 0 4px;
  color: var(--text-muted);
}

.tracks-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.tracks-ruler {
  height: 24px;
  margin-left: 200px; /* Offset to align with tracks */
  position: relative;
  border-bottom: 1px solid var(--color-border);
  cursor: ew-resize;
  user-select: none;
}

.ruler-marker {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
}

.timeline-playhead {
  position: absolute;
  top: 0;
  bottom: -150px; /* Stretch through all tracks */
  width: 2px;
  background: var(--color-orange);
  z-index: 10;
  pointer-events: none;
  transition: left 0.05s linear;
}

.playhead-knob {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-orange);
  position: absolute;
  top: 0;
  left: -5px;
  box-shadow: var(--shadow-sm);
}

.track-row {
  display: flex;
  height: 48px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-light-blue);
  transition: opacity 0.2s ease;
}

.track-row.disabled {
  opacity: 0.4;
}

.track-info {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-element);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
}

.track-icon {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
}

.track-title {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.track-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.track-block {
  height: 32px;
  margin: 7px 12px;
  background: var(--color-orange-light);
  border: 1px dashed var(--color-orange);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-orange);
}

.audio-content {
  background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.05), transparent);
}

.waveform-wave {
  height: 20px;
  margin: 14px 12px;
  background: repeating-linear-gradient(90deg, var(--color-blue) 0px, var(--color-blue) 2px, transparent 2px, transparent 6px);
  opacity: 0.6;
  border-radius: 2px;
}

.wave-alt {
  background: repeating-linear-gradient(90deg, var(--color-success) 0px, var(--color-success) 2px, transparent 2px, transparent 8px);
}
</style>
