<script setup lang="ts">
import { computed } from 'vue';
import { CircleDashed, Focus, ImageOff, Link2, Lock } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineTrimHandle from './TimelineTrimHandle.vue';
import BlickWaveformCanvas from './waveform/BlickWaveformCanvas.vue';
import { timelineClipStyle } from './timeline-clip-geometry';
import type { TimelineClipProps } from './timeline-clip-types';
import { useTimelineCanvasArtwork } from './composables/useTimelineCanvasArtwork';

const props = defineProps<TimelineClipProps>();
const emit = defineEmits<{
  select: [event: MouseEvent];
  move: [event: PointerEvent];
  contextmenu: [event: MouseEvent];
  trim: [value: { event: PointerEvent; edge: 'start' | 'end' }];
}>();
const { t } = useTranslate('TimelineTracks');
const { t: mediaText } = useTranslate('ScreenshotComposition');
const { error } = useTimelineCanvasArtwork(props);
const label = computed(() =>
  'freezeFrameSourceMs' in props.clip
    ? t('holdSegment')
    : (props.clip.kind === 'shape' ? props.clip.text?.content.trim() : '') || props.clip.name,
);
const icon = computed(() =>
  props.clip.kind === 'blur' ? (props.clip.mode === 'highlight' ? Focus : CircleDashed) : null,
);
const title = computed(() => (props.linkedClipNames?.length ? props.linkedClipNames.join(' · ') : label.value));
const labelInset = computed(() => (props.clip.locked ? 15 : 0) + (props.linkedClipNames?.length ? 15 : 0));
</script>
<template>
  <button
    type="button"
    class="timeline-clip canvas-clip-target"
    :data-timeline-clip-id="clip.id"
    :aria-label="label"
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
      class="audio-clip-label"
      :style="{
        left: `${8 + labelInset}px`,
        maxWidth: `calc(100% - ${16 + labelInset}px)`,
      }"
      aria-hidden="true"
      >{{ label }}</span
    >
    <span class="canvas-clip-icons" aria-hidden="true">
      <Lock v-if="clip.locked" :size="12" />
      <component :is="icon" v-if="icon" :size="12" />
      <Link2 v-if="linkedClipNames?.length" :size="12" />
      <ImageOff v-if="error" :size="12" :title="error" />
    </span>
    <span v-if="Math.abs(clip.playbackRate - 1) > 0.01" class="speed-badge">{{ clip.playbackRate.toFixed(2) }}×</span>
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
  color: var(--color-timeline-media-label-text);
  pointer-events: none;
}
.speed-badge {
  position: absolute;
  top: 2px;
  right: 8px;
  color: var(--color-timeline-media-label-text);
  background: var(--color-timeline-media-label);
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
  color: var(--color-timeline-media-label-text);
  background: var(--color-timeline-media-label);
  pointer-events: none;
}
</style>
<style scoped src="./timeline-item-states.css"></style>
