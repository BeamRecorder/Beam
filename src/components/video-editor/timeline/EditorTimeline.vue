<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import TimelineTracks from './TimelineTracks.vue';
import type { ExportProgress } from '../../export/export-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { ClipComposition } from '~/media/shared/composition-types';

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    exportProgress?: ExportProgress | null;
    zoomElements: ZoomElement[];
    selectedZoomId: string | null;
    composition: ClipComposition;
    selectedClipId: string | null;
    zoomLevel: number;
    isSnappingEnabled?: boolean;
  }>(),
  { isSnappingEnabled: true },
);
const emit = defineEmits<{
  (event: 'update:currentTime', value: number): void;
  (event: 'update:isPlaying', value: boolean): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'preview:composition', value: ClipComposition | null): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'add:zoom', timeMs: number): void;
  (event: 'add:caption', timeMs: number): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
}>();

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.code !== 'Space') return;
  const active = document.activeElement;
  if (active) {
    const tag = active.tagName.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || active.getAttribute('contenteditable') === 'true') return;
  }
  event.preventDefault();
  emit('update:isPlaying', !props.isPlaying);
};
onMounted(() => window.addEventListener('keydown', handleKeyDown));
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown));
</script>

<template>
  <div class="timeline-island-container">
    <TimelineTracks
      :current-time="currentTime"
      :duration="duration"
      :is-playing="isPlaying"
      :zoom-level="zoomLevel"
      :export-progress="exportProgress"
      :zoom-elements="zoomElements"
      :selected-zoom-id="selectedZoomId"
      :composition="composition"
      :selected-clip-id="selectedClipId"
      :is-snapping-enabled="isSnappingEnabled"
      @update:current-time="emit('update:currentTime', $event)"
      @update:zoom-level="emit('update:zoomLevel', $event)"
      @select:zoom="emit('select:zoom', $event)"
      @select:clip="emit('select:clip', $event)"
      @toggle:clip="emit('toggle:clip', $event)"
      @trim:clip="emit('trim:clip', $event)"
      @move:clip="emit('move:clip', $event)"
      @preview:composition="emit('preview:composition', $event)"
      @trim:zoom="emit('trim:zoom', $event)"
      @move:zoom="emit('move:zoom', $event)"
      @add:zoom="emit('add:zoom', $event)"
      @add:caption="emit('add:caption', $event)"
      @reorder:clip="emit('reorder:clip', $event)"
    />
  </div>
</template>

<style scoped>
.timeline-island-container {
  width: 100%;
  height: 100%;
  max-height: 100%;
  background: var(--color-bg-element);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
