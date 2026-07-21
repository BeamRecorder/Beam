<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import TimelineToolbar from './TimelineToolbar.vue';
import TimelineTracks from './TimelineTracks.vue';
import type { ZoomElement } from '../zoom/zoom-types';
import type { ProjectEditorData } from '../../../api/types/capture-api';

const props = defineProps<{
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  videoSrc?: string | null;
  editorData?: ProjectEditorData | null;
  
  // Track toggle states
  isVideoEnabled: boolean;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:currentTime', value: number): void;
  (e: 'update:isPlaying', value: boolean): void;
  (e: 'update:isVideoEnabled', value: boolean): void;
  (e: 'update:isSystemAudioEnabled', value: boolean): void;
  (e: 'update:isMicAudioEnabled', value: boolean): void;
  (e: 'select:zoom', zoomId: string): void;
}>();

const zoomLevel = ref<number>(100);

// Global Spacebar shortcut listener to play/pause
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    const active = document.activeElement;
    if (active) {
      const tagName = active.tagName.toLowerCase();
      const isEditable = active.getAttribute('contenteditable') === 'true';
      if (
        tagName === 'input' || 
        tagName === 'textarea' || 
        tagName === 'select' || 
        isEditable
      ) {
        return; // ignore spacebar if typing
      }
    }
    
    e.preventDefault();
    emit('update:isPlaying', !props.isPlaying);
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div class="timeline-island-container">
    <!-- Toolbar Component -->
    <TimelineToolbar
      :current-time="currentTime"
      :duration="duration"
      :is-playing="isPlaying"
      v-model:zoom-level="zoomLevel"
      @update:isPlaying="emit('update:isPlaying', $event)"
      @update:currentTime="emit('update:currentTime', $event)"
    />

    <!-- Tracks Viewport Component -->
    <TimelineTracks
      :current-time="currentTime"
      :duration="duration"
      v-model:zoom-level="zoomLevel"
      :video-src="videoSrc || null"
      :editor-data="editorData"
      :is-video-enabled="isVideoEnabled"
      :is-system-audio-enabled="isSystemAudioEnabled"
      :is-mic-audio-enabled="isMicAudioEnabled"
      :zoom-elements="zoomElements"
      :selected-zoom-id="selectedZoomId"
      @update:currentTime="emit('update:currentTime', $event)"
      @select:zoom="emit('select:zoom', $event)"
      @toggle:video="emit('update:isVideoEnabled', !isVideoEnabled)"
      @toggle:systemAudio="emit('update:isSystemAudioEnabled', !isSystemAudioEnabled)"
      @toggle:micAudio="emit('update:isMicAudioEnabled', !isMicAudioEnabled)"
    />
  </div>
</template>

<style scoped>
.timeline-island-container {
  width: 100%;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>
