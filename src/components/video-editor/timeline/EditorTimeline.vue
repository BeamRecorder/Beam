<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import TimelineTracks from './TimelineTracks.vue';
import type { ExportProgress } from '../../export/export-types';
import { DEFAULT_ZOOM_DURATION_MS, type ZoomElement } from '../zoom/zoom-types';
import type { ClipComposition } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS, type OutputCanvasSettings } from '../canvas/output-canvas';
import { EMPTY_CLIP_TRANSITIONS } from '~/media/shared/clip-transitions';
import type {
  TimelineClipboardItem,
  TimelinePasteHighlight,
  TimelinePasteRequest,
} from './composables/timeline-clipboard-types';
import type { TrackClipSelection } from './composables/timeline-tracks-types';

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    exportProgress?: ExportProgress | null;
    includeAudioInExport?: boolean;
    zoomElements: ZoomElement[];
    newZoomDurationMs?: number;
    selectedZoomId: string | null;
    composition: ClipComposition;
    selectedClipId: string | null;
    selectedClipIds?: string[];
    zoomLevel: number;
    isSnappingEnabled?: boolean;
    projectId?: string | null;
    recentPaste?: TimelinePasteHighlight | null;
    canvas?: OutputCanvasSettings;
  }>(),
  {
    isSnappingEnabled: true,
    includeAudioInExport: true,
    newZoomDurationMs: DEFAULT_ZOOM_DURATION_MS,
    canvas: () => ({ ...DEFAULT_OUTPUT_CANVAS, transitions: { ...EMPTY_CLIP_TRANSITIONS } }),
    selectedClipIds: () => [],
  },
);
const emit = defineEmits<{
  (event: 'update:currentTime', value: number): void;
  (event: 'update:isPlaying', value: boolean): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'select:track', selection: TrackClipSelection): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'delete:clips', clipIds: string[]): void;
  (event: 'delete:zoom', zoomId: string): void;
  (event: 'hold:clip', payload: { id: string; timeMs: number }): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'preview:composition', value: ClipComposition | null): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'add:zoom', timeMs: number): void;
  (event: 'add:caption', timeMs: number): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
  (event: 'paste:item', payload: TimelinePasteRequest): void;
  (event: 'paste:error', message: string): void;
  (event: 'clipboard:copied', item: TimelineClipboardItem): void;
  (event: 'preview:canvas', value: OutputCanvasSettings | null): void;
  (event: 'update:canvas', value: OutputCanvasSettings): void;
  (event: 'open:canvas-transition', edge: 'entry' | 'exit'): void;
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
    <div class="timeline-scale-content">
      <TimelineTracks
        :current-time="currentTime"
        :duration="duration"
        :is-playing="isPlaying"
        :zoom-level="zoomLevel"
        :export-progress="exportProgress"
        :include-audio-in-export="includeAudioInExport"
        :zoom-elements="zoomElements"
        :new-zoom-duration-ms="newZoomDurationMs"
        :selected-zoom-id="selectedZoomId"
        :composition="composition"
        :selected-clip-id="selectedClipId"
        :selected-clip-ids="selectedClipIds"
        :is-snapping-enabled="isSnappingEnabled"
        :project-id="projectId"
        :recent-paste="recentPaste"
        :canvas="canvas"
        @update:current-time="emit('update:currentTime', $event)"
        @update:zoom-level="emit('update:zoomLevel', $event)"
        @select:zoom="emit('select:zoom', $event)"
        @select:clip="emit('select:clip', $event)"
        @select:track="emit('select:track', $event)"
        @toggle:clip="emit('toggle:clip', $event)"
        @delete:clips="emit('delete:clips', $event)"
        @delete:zoom="emit('delete:zoom', $event)"
        @hold:clip="emit('hold:clip', $event)"
        @trim:clip="emit('trim:clip', $event)"
        @move:clip="emit('move:clip', $event)"
        @preview:composition="emit('preview:composition', $event)"
        @trim:zoom="emit('trim:zoom', $event)"
        @move:zoom="emit('move:zoom', $event)"
        @add:zoom="emit('add:zoom', $event)"
        @add:caption="emit('add:caption', $event)"
        @reorder:clip="emit('reorder:clip', $event)"
        @paste:item="emit('paste:item', $event)"
        @paste:error="emit('paste:error', $event)"
        @clipboard:copied="emit('clipboard:copied', $event)"
        @preview:canvas="emit('preview:canvas', $event)"
        @update:canvas="emit('update:canvas', $event)"
        @open:canvas-transition="emit('open:canvas-transition', $event)"
      />
    </div>
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

.timeline-scale-content {
  zoom: var(--ui-scale-timeline, 1);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
