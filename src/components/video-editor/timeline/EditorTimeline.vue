<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import TimelineTracks from './TimelineTracks.vue';
import type { ZoomElement } from '../zoom/zoom-types';
import type { ProjectEditorData } from '../../../api/types/capture-api';
import type { ProjectComposition } from '../composition/composition-types';

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
  isCameraEnabled: boolean;
  zoomElements: ZoomElement[];
  selectedZoomId: string | null;
  composition: ProjectComposition;
  selectedCompositionLayerId: string | null;
  selectedCameraLayerId: string | null;
  zoomLevel: number;
}>();

const emit = defineEmits<{
  (e: 'update:currentTime', value: number): void;
  (e: 'update:isPlaying', value: boolean): void;
  (e: 'update:zoomLevel', value: number): void;
  (e: 'update:isVideoEnabled', value: boolean): void;
  (e: 'update:isSystemAudioEnabled', value: boolean): void;
  (e: 'update:isMicAudioEnabled', value: boolean): void;
  (e: 'select:zoom', zoomId: string): void;
  (e: 'add:element', type: 'video' | 'image' | 'sound' | 'caption'): void;
  (e: 'select:composition-layer', layerId: string): void;
  (e: 'select:base-video'): void;
  (e: 'select:camera-layer', layerId: string): void;
  (e: 'toggle:camera'): void;
  (e: 'toggle:camera-layer'): void;
  (e: 'split:camera'): void;
  (e: 'trim:camera', edge: 'start' | 'end'): void;
  (e: 'unlink'): void;
  (e: 'unlink-track', trackKind: string): void;
  (e: 'add:zoom', timeMs: number): void;
  (e: 'add:caption', timeMs: number): void;
}>();

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
    <!-- Tracks Viewport Component -->
    <TimelineTracks
      :current-time="currentTime"
      :duration="duration"
      :zoom-level="zoomLevel"
      @update:zoom-level="emit('update:zoomLevel', $event)"
      :video-src="videoSrc || null"
      :editor-data="editorData"
      :is-video-enabled="isVideoEnabled"
      :is-system-audio-enabled="isSystemAudioEnabled"
      :is-mic-audio-enabled="isMicAudioEnabled"
      :is-camera-enabled="isCameraEnabled"
      :zoom-elements="zoomElements"
      :selected-zoom-id="selectedZoomId"
      :composition="composition"
      :selected-composition-layer-id="selectedCompositionLayerId"
      :selected-camera-layer-id="selectedCameraLayerId"
      @update:currentTime="emit('update:currentTime', $event)"
      @select:zoom="emit('select:zoom', $event)"
      @select:composition-layer="emit('select:composition-layer', $event)"
      @select:base-video="emit('select:base-video')"
      @toggle:video="emit('update:isVideoEnabled', !isVideoEnabled)"
      @toggle:systemAudio="emit('update:isSystemAudioEnabled', !isSystemAudioEnabled)"
      @toggle:micAudio="emit('update:isMicAudioEnabled', !isMicAudioEnabled)"
      @toggle:camera="emit('toggle:camera')"
      @toggle:camera-layer="emit('toggle:camera-layer')"
      @select:camera-layer="emit('select:camera-layer', $event)"
      @split:camera="emit('split:camera')"
      @trim:camera="emit('trim:camera', $event)"
      @unlink="emit('unlink')"
      @unlink-track="emit('unlink-track', $event)"
      @add:zoom="emit('add:zoom', $event)"
      @add:caption="emit('add:caption', $event)"
    />
  </div>
</template>

<style scoped>
.timeline-island-container {
  width: 100%;
  background: var(--color-bg-element);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>
