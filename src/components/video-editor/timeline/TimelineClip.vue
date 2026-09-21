<script setup lang="ts">
import TimelineLockOverlay from './TimelineLockOverlay.vue';
import { CircleDashed, Focus, Link2, Lock } from '@lucide/vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import { sourceTimeAt } from '~/media/shared';
import { useThumbnails } from './waveform/useThumbnails';
import { useTranslate } from '~/i18n/useTranslate';
import BlickWaveformCanvas from './waveform/BlickWaveformCanvas.vue';
import {
  formatTimelineTrimTime,
  timelineClipStyle,
  timelineFrameStyle,
  timelineTransitionStyle,
} from './timeline-clip-geometry';
import TimelineTransitionCurve from './TimelineTransitionCurve.vue';
import ShapeTimelinePreview from './ShapeTimelinePreview.vue';
import ColorTimelinePreview from './ColorTimelinePreview.vue';
import type { TimelineClipProps } from './timeline-clip-types';
import { thumbnailIsPending, thumbnailUrlFor, timelineThumbnailWidth } from './timeline-thumbnail-presentation';
const { t } = useTranslate('TimelineTracks');
const { t: tHighlight } = useTranslate('Highlight');
const props = defineProps<TimelineClipProps>();
const emit = defineEmits<{
  (event: 'select', value: MouseEvent): void;
  (event: 'move', value: PointerEvent): void;
  (event: 'trim', value: { event: PointerEvent; edge: 'start' | 'end' }): void;
  (event: 'contextmenu', value: MouseEvent): void;
}>();
const videoAsset = computed(() => (props.clip.kind !== 'audio' && props.asset?.kind === 'video' ? props.asset : null));
const { thumbnails, widths, requestVisibleFrames } = useThumbnails(videoAsset);
const clipEndMs = computed(() => props.clip.timelineStartMs + props.clip.timelineDurationMs);
type TimelineFrame = { timelineSecond: number; mediaSecond: number; relativeMs: number; durationMs: number };
const frames = computed<TimelineFrame[]>(() =>
  props.thumbnailSlots.flatMap((slot) => {
    if (props.clip.kind === 'audio' || props.asset?.kind !== 'video') return [];
    const slotStartMs = slot.timelineSeconds * 1_000;
    const slotEndMs = slotStartMs + slot.durationSeconds * 1_000;
    const timelineMs = Math.max(slotStartMs, props.clip.timelineStartMs);
    const timelineEndMs = Math.min(slotEndMs, clipEndMs.value);
    if (timelineEndMs <= timelineMs) return [];
    const sourceMs = sourceTimeAt(props.clip, timelineMs);
    if (sourceMs === null) return [];
    return [
      {
        timelineSecond: slot.timelineSeconds,
        mediaSecond: Math.max(0, Math.round(sourceMs) / 1_000),
        relativeMs: timelineMs - props.clip.timelineStartMs,
        durationMs: timelineEndMs - timelineMs,
      },
    ];
  }),
);
const frozenFrames = ref<TimelineFrame[]>([]);
const displayedFrames = computed(() => (frozenFrames.value.length ? frozenFrames.value : frames.value));
const requestedThumbnailWidth = computed(() =>
  timelineThumbnailWidth(frames.value, props.timelineWidthPx, props.duration, window.devicePixelRatio || 1),
);
const thumbnailRefreshKey = computed(() =>
  [
    props.thumbnailSlots.map((slot) => `${slot.timelineSeconds}:${slot.durationSeconds}`).join(','),
    props.asset?.src ?? '',
    props.asset?.id ?? '',
    props.clip.timelineStartMs,
    props.clip.timelineDurationMs,
    props.clip.sourceInMs,
    props.clip.sourceDurationMs,
    props.clip.playbackRate,
    requestedThumbnailWidth.value,
    'freezeFrameSourceMs' in props.clip ? props.clip.freezeFrameSourceMs : '',
  ].join('|'),
);
watch(
  () => props.thumbnailSlots,
  () => {
    frozenFrames.value = frames.value;
  },
  { immediate: true },
);
watch(
  [thumbnailRefreshKey, () => props.deferThumbnailRequests],
  () => {
    if (props.deferThumbnailRequests) return;
    const value = frames.value;
    frozenFrames.value = value;
    requestVisibleFrames([...new Set(value.map((frame) => frame.mediaSecond))], requestedThumbnailWidth.value);
  },
  { immediate: true },
);
const clipStyle = computed(() => timelineClipStyle(props.clip, props.duration, props.timelineWidthPx));
const visualKind = computed(() =>
  props.clip.kind === 'blur' && props.clip.mode === 'highlight' ? 'highlight' : props.clip.kind,
);
const clipIcon = computed(() =>
  visualKind.value === 'highlight' ? Focus : visualKind.value === 'blur' ? CircleDashed : null,
);
const clipLabel = computed(() =>
  'freezeFrameSourceMs' in props.clip
    ? t('holdSegment')
    : (props.clip.kind === 'shape' ? props.clip.text?.content.trim() : '') || props.clip.name,
);
const imagePreviewStyle = computed(() => ({
  backgroundImage:
    props.asset?.kind === 'image' && props.asset.src ? `url(${JSON.stringify(props.asset.src)})` : undefined,
}));
const frameStyle = (frame: TimelineFrame) => timelineFrameStyle(props.clip, frame.relativeMs, frame.durationMs);
const transitionStyle = (edge: 'entry' | 'exit') => timelineTransitionStyle(props.clip, edge);
const thumbnailFor = (frame: TimelineFrame) => thumbnailUrlFor(frame.mediaSecond, thumbnails.value);
const thumbnailPending = (frame: TimelineFrame) =>
  thumbnailIsPending(frame.mediaSecond, thumbnails.value, widths.value, requestedThumbnailWidth.value);
let marqueeFrame = 0;
let marqueeTimer = 0;
const stopMarquee = (target?: HTMLElement | null) => {
  window.cancelAnimationFrame(marqueeFrame);
  window.clearTimeout(marqueeTimer);
  marqueeFrame = 0;
  marqueeTimer = 0;
  const label = target?.querySelector<HTMLElement>('.clip-label-text');
  if (label) label.style.transform = '';
};
const stopMarqueeForEvent = (event: PointerEvent) => stopMarquee(event.currentTarget as HTMLElement | null);
const startMarquee = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement;
  const label = target.querySelector<HTMLElement>('.clip-label-text');
  if (!label) return;
  const distance = label.scrollWidth - label.clientWidth;
  if (distance <= 0) return;
  stopMarquee(target);
  marqueeTimer = window.setTimeout(() => {
    const startedAt = performance.now();
    const travelMs = Math.max(3_000, (distance / 36) * 1_000);
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs;
      label.style.transform = `translateX(${-distance * (phase <= 1 ? phase : 2 - phase)}px)`;
      marqueeFrame = window.requestAnimationFrame(tick);
    };
    marqueeFrame = window.requestAnimationFrame(tick);
  }, 300);
};
onUnmounted(() => stopMarquee());
</script>
<template>
  <button
    type="button"
    class="timeline-clip"
    :data-timeline-clip-id="clip.id"
    :title="linkedClipNames?.length ? linkedClipNames.join(' · ') : clipLabel"
    :class="[`kind-${visualKind}`, { selected, disabled: !clip.enabled, 'trim-at-limit': trimState?.atLimit }]"
    :data-paste-highlight="pasteHighlight || undefined"
    :style="clipStyle"
    @click.stop="emit('select', $event)"
    @contextmenu.prevent.stop="emit('contextmenu', $event)"
    @pointerdown="emit('move', $event)"
    @pointerenter="startMarquee"
    @pointerleave="stopMarqueeForEvent"
  >
    <span
      v-if="clip.transitions?.entry"
      class="transition-zone entry"
      :style="transitionStyle('entry')"
      aria-hidden="true"
    >
      <TimelineTransitionCurve edge="entry" :transition="clip.transitions.entry" />
    </span>
    <span
      v-if="clip.transitions?.exit"
      class="transition-zone exit"
      :style="transitionStyle('exit')"
      aria-hidden="true"
    >
      <TimelineTransitionCurve edge="exit" :transition="clip.transitions.exit" />
    </span>
    <div v-if="clip.kind === 'audio'" class="waveform" aria-hidden="true">
      <div v-if="waveformBars?.length" class="waveform-slice">
        <BlickWaveformCanvas
          v-if="waveformBands"
          :bars="waveformBars"
          :bands="waveformBands"
          :left-percent="waveformLeftPercent"
          :width-percent="waveformWidthPercent"
          :source-duration-seconds="waveformSourceDurationSeconds ?? 0"
          :loading-segments="waveformLoadingSegments ?? []"
          :defer-draw="deferWaveformDraw"
        />
      </div>
      <span v-else-if="waveformStatus === 'loading'" class="waveform-loading" />
      <span v-else-if="waveformStatus === 'error'" class="waveform-unavailable" :title="waveformError?.message">
        {{ t('waveformUnavailable') }}
      </span>
    </div>
    <TransitionGroup v-else-if="asset?.kind === 'video'" tag="div" name="thumbnail-slot" class="thumbnails-track">
      <div
        v-for="frame in displayedFrames"
        :key="`${frame.timelineSecond}:${frame.mediaSecond}`"
        class="thumbnail-frame"
        :style="frameStyle(frame)"
      >
        <Transition name="thumbnail-crossfade">
          <img
            v-if="thumbnailFor(frame)"
            :key="thumbnailFor(frame)!"
            :src="thumbnailFor(frame)!"
            class="thumbnail-img"
            :class="{ 'thumbnail-img--pending': thumbnailPending(frame) }"
            alt=""
            draggable="false"
          />
        </Transition>
        <span v-if="thumbnailPending(frame)" class="thumbnail-loading-overlay" />
      </div>
    </TransitionGroup>
    <span
      v-else-if="asset?.kind === 'image' && asset.src"
      class="image-preview"
      :style="imagePreviewStyle"
      aria-hidden="true"
    />
    <ColorTimelinePreview v-else-if="clip.kind === 'color'" :clip="clip" />
    <ShapeTimelinePreview v-else-if="clip.kind === 'shape'" :clip="clip" :canvas="canvas" />
    <span
      class="trim-handle start"
      :class="{ 'at-limit': trimState?.edge === 'start' && trimState?.atLimit }"
      :title="t('trimStart')"
      @pointerdown.stop="emit('trim', { event: $event, edge: 'start' })"
    >
      <span v-if="trimState?.edge === 'start'" class="trim-side-badge" :class="{ 'at-limit': trimState?.atLimit }">{{
        formatTimelineTrimTime(trimState.durationMs)
      }}</span>
    </span>
    <TimelineLockOverlay v-if="clip.locked" />
    <span class="clip-label-overlay">
      <Lock v-if="clip.locked" :size="12" :aria-label="t('locked')" />
      <component
        :is="clipIcon"
        v-if="clipIcon"
        class="clip-kind-icon"
        :size="12"
        role="img"
        :aria-label="visualKind === 'highlight' ? tHighlight('title') : t('blur')"
      />
      <span class="clip-label-text">{{ clipLabel }}</span>
      <span v-if="linkedClipNames?.length" class="linked-badge">
        <Link2 :size="12" role="img" :aria-label="linkedClipNames.join(' · ')" />
      </span>
      <span v-if="Math.abs(clip.playbackRate - 1) > 0.01" class="speed-badge">{{ clip.playbackRate.toFixed(2) }}×</span>
    </span>
    <span
      class="trim-handle end"
      :class="{ 'at-limit': trimState?.edge === 'end' && trimState?.atLimit }"
      :title="t('trimEnd')"
      @pointerdown.stop="emit('trim', { event: $event, edge: 'end' })"
    >
      <span v-if="trimState?.edge === 'end'" class="trim-side-badge" :class="{ 'at-limit': trimState?.atLimit }">{{
        formatTimelineTrimTime(trimState.durationMs)
      }}</span>
    </span>
  </button>
</template>
<style scoped>
.timeline-clip {
  position: absolute;
  top: 2px;
  bottom: 2px;
  min-width: 14px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-bg-surface);
  color: var(--text-primary);
  cursor: grab;
  isolation: isolate;
  contain: layout paint style;
  box-sizing: border-box;
  transition:
    opacity var(--fast) ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    width 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.timeline-clip:active {
  cursor: grabbing;
}
.timeline-clip:hover {
  border-color: var(--color-primary);
}
.timeline-clip.disabled {
  opacity: 0.42;
}
.timeline-clip.selected {
  border-color: var(--color-primary);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.transition-zone {
  position: absolute;
  inset-block: 0;
  z-index: 30;
  pointer-events: none;
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 20%, transparent);
}
.transition-zone.entry {
  left: 0;
}
.transition-zone.exit {
  right: 0;
}
.timeline-clip.disabled .transition-zone {
  opacity: 0.65;
}
.timeline-clip.kind-caption {
  background: var(--color-track-annotation);
  color: #fff;
}
.timeline-clip.kind-blur {
  background: linear-gradient(110deg, var(--color-track-blur), var(--color-track-blur-highlight));
  color: #fff;
}
.timeline-clip.kind-color {
  background: var(--color-bg-surface);
  color: #fff;
}
.timeline-clip.kind-shape {
  background: color-mix(in srgb, var(--color-track-annotation) 24%, var(--color-bg-surface));
  color: var(--text-primary);
}
.timeline-clip.kind-audio {
  background: var(--color-track-audio-light);
}
.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 40;
  width: 10px;
  max-width: 28%;
  background: rgba(255, 255, 255, 0.28);
  cursor: col-resize;
  transition: background var(--fast) ease;
}
.trim-handle:hover {
  background: var(--color-primary);
}
.trim-handle.at-limit,
.trim-handle.at-limit:hover {
  background: var(--color-destructive, #ef4444);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.7);
}
.trim-handle.start {
  left: 0;
  border-top-left-radius: var(--radius-sm);
  border-bottom-left-radius: var(--radius-sm);
}
.trim-handle.end {
  right: 0;
  border-top-right-radius: var(--radius-sm);
  border-bottom-right-radius: var(--radius-sm);
}
.trim-side-badge {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  font-family: monospace;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.trim-side-badge.at-limit {
  background: var(--color-destructive, #ef4444);
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.5);
}
.timeline-clip.trim-at-limit {
  border-color: var(--color-destructive, #ef4444) !important;
  box-shadow: 0 0 0 1px var(--color-destructive, #ef4444);
}
.trim-handle.start .trim-side-badge {
  left: 8px;
}
.trim-handle.end .trim-side-badge {
  right: 8px;
}
.clip-label-overlay {
  position: absolute;
  z-index: 35;
  left: 8px;
  top: 2px;
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: calc(100% - 16px);
  overflow: hidden;
  white-space: nowrap;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  line-height: 1.1;
  pointer-events: none;
}
.clip-label-text {
  display: inline-block;
  min-width: 0;
  white-space: nowrap;
  transition: transform 0.05s linear;
}
.clip-kind-icon {
  flex: none;
}
.linked-badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  padding: 1px 3px;
  border-radius: var(--radius-xs);
  background: var(--color-primary);
  color: #fff;
}
.speed-badge {
  flex: none;
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: var(--color-primary);
  color: #fff;
}
</style>

<style scoped src="./waveform/audio-waveform.css"></style>
<style scoped src="./timeline-highlight.css"></style>
<style scoped src="./timeline-thumbnail.css"></style>
