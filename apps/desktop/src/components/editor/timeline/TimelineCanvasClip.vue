<script setup lang="ts">
import { computed, inject } from 'vue';
import { CircleDashed, Focus, ImageOff, Link2, Lock, MousePointer2, MousePointer2Off } from '@lucide/vue';
import { screenCursorEnabled } from '@beam/engine/capture/screen-cursor';
import { customCursorKey } from '../properties/cursor/custom-cursor-context';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineTrimHandle from './TimelineTrimHandle.vue';
import TimelineTrackPropertyFeedback from './TimelineTrackPropertyFeedback.vue';
import BlickWaveformCanvas from './waveform/BlickWaveformCanvas.vue';
import { timelineClipStyle } from './timeline-clip-geometry';
import type { TimelineClipProps } from './timeline-clip-types';
import { useTimelineCanvasArtwork } from './composables/useTimelineCanvasArtwork';
import { useTimelineOverlayContrast } from './timeline-overlay-contrast';
import { timelineMetadataInset } from '@beam/runtime/timeline/timeline-canvas-layout';
const vTimelineOverlayContrast = useTimelineOverlayContrast();

const props = defineProps<TimelineClipProps>();
const emit = defineEmits<{
  select: [event: MouseEvent];
  move: [event: PointerEvent];
  contextmenu: [event: MouseEvent];
  trim: [value: { event: PointerEvent; edge: 'start' | 'end' }];
}>();
const { t } = useTranslate('TimelineTracks');
const { t: mediaText } = useTranslate('ScreenshotComposition');
const { t: cursorText } = useTranslate('CursorRecording');
const { t: clipText } = useTranslate('ClipPropertiesPanel');
const cursorDefault = inject(customCursorKey, null);
const cursorVisible = computed(() => screenCursorEnabled(props.clip, cursorDefault?.value ?? true));
const cursorLabel = computed(
  () => `${cursorText('customCursor')}: ${clipText(cursorVisible.value ? 'enabled' : 'disabled')}`,
);
const { error } = useTimelineCanvasArtwork(props);
const label = computed(() =>
  'freezeFrameSourceMs' in props.clip
    ? t('holdSegment')
    : (props.clip.kind === 'shape' ? props.clip.text?.content.trim() : '') || props.clip.name,
);
const icon = computed(() =>
  props.clip.kind === 'blur' ? (props.clip.mode === 'highlight' ? Focus : CircleDashed) : null,
);
const title = computed(() =>
  [
    props.linkedClipNames?.length ? props.linkedClipNames.join(' · ') : label.value,
    ...(props.clip.kind === 'screen' ? [cursorLabel.value] : []),
  ].join(' · '),
);
const labelInset = computed(() =>
  timelineMetadataInset(Number(Boolean(props.clip.locked)) + Number(Boolean(props.linkedClipNames?.length))),
);
</script>
<template>
  <button
    type="button"
    class="timeline-clip canvas-clip-target"
    :data-timeline-clip-id="clip.id"
    :aria-label="clip.kind === 'screen' ? `${label} · ${cursorLabel}` : label"
    :title="title"
    :data-paste-highlight="pasteHighlight || undefined"
    :class="{
      selected,
      disabled: !clip.enabled,
      'trim-at-limit': trimState?.atLimit,
    }"
    :style="timelineClipStyle(clip, duration, timelineWidthPx)"
    @click.stop="emit('select', $event)"
    @pointerdown="emit('move', $event)"
    @contextmenu.prevent.stop="emit('contextmenu', $event)"
  >
    <TimelineTrackPropertyFeedback :clip-id="clip.id" />
    <div v-if="clip.kind === 'audio'" class="waveform" aria-hidden="true">
      <BlickWaveformCanvas
        v-if="waveformBars?.length && waveformBands"
        :bars="waveformBars"
        :bands="waveformBands"
        :left-percent="waveformLeftPercent"
        :width-percent="waveformWidthPercent"
        :source-duration-seconds="waveformSourceDurationSeconds ?? 0"
        :loading-segments="waveformLoadingSegments ?? []"
        :defer-draw="deferWaveformDraw"
        :geometry-key="timelineWidthPx"
      />
      <span v-else-if="waveformStatus === 'loading'" class="waveform-status">{{ mediaText('previewLoading') }}</span>
      <span v-else-if="waveformStatus === 'error'" class="waveform-status" :title="waveformError?.message">{{
        t('waveformUnavailable')
      }}</span>
    </div>
    <span
      v-if="clip.kind === 'audio'"
      v-timeline-overlay-contrast
      class="audio-clip-label timeline-overlay-contrast"
      :style="{
        left: `${8 + labelInset}px`,
        maxWidth: `calc(100% - ${16 + labelInset}px)`,
      }"
      aria-hidden="true"
      >{{ label }}</span
    >
    <span
      v-if="clip.locked || clip.kind === 'screen' || icon || linkedClipNames?.length || error"
      v-timeline-overlay-contrast
      class="canvas-clip-icons timeline-overlay-contrast"
      aria-hidden="true"
    >
      <Lock v-if="clip.locked" :size="12" />
      <component
        v-if="clip.kind === 'screen'"
        :is="cursorVisible ? MousePointer2 : MousePointer2Off"
        :size="12"
        :data-cursor-visible="cursorVisible"
      />
      <component :is="icon" v-if="icon" :size="12" />
      <Link2 v-if="linkedClipNames?.length" :size="12" />
      <ImageOff v-if="error" :size="12" :title="error" />
    </span>
    <span
      v-if="Math.abs(clip.playbackRate - 1) > 0.01"
      v-timeline-overlay-contrast
      class="speed-badge timeline-overlay-contrast"
      >{{ clip.playbackRate.toFixed(2) }}×</span
    >
    <TimelineTrimHandle
      v-for="edge in ['start', 'end'] as const"
      :key="edge"
      :edge="edge"
      :state="trimState"
      :title="edge === 'start' ? t('trimStart') : t('trimEnd')"
      @start="emit('trim', { event: $event, edge })"
    />
  </button>
</template>
<style scoped>
.timeline-clip.canvas-clip-target {
  position: absolute;
  z-index: 2;
  inset-block: 0;
  min-width: 14px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  contain: layout style;
  isolation: isolate;
}
.canvas-clip-target:hover {
  outline: 1px solid var(--color-timeline-item-hover);
}
.canvas-clip-target:focus-visible {
  outline: 2px solid var(--color-timeline-selection);
  outline-offset: 1px;
}
.canvas-clip-target.disabled {
  opacity: var(--timeline-disabled-opacity);
}
.canvas-clip-icons {
  position: absolute;
  display: flex;
  gap: 3px;
  left: 8px;
  top: 3px;
  padding: 2px;
  margin: -2px;
  pointer-events: none;
}
.speed-badge {
  position: absolute;
  top: 2px;
  right: 8px;
  padding: 1px 4px;
  font-size: 9px;
  border-radius: var(--radius-sm);
  pointer-events: none;
}
.waveform {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: var(--radius-sm);
}
.waveform-status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--color-timeline-item-text);
  font-size: 9px;
}
.audio-clip-label {
  position: absolute;
  top: 2px;
  max-width: calc(100% - 16px);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  white-space: nowrap;
  font-size: 9px;
  line-height: 1.1;
  pointer-events: none;
}
</style>
<style scoped src="./timeline-item-states.css"></style>
<style scoped src="./timeline-overlay-contrast.css"></style>
