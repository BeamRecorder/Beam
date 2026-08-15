<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { MediaError } from '~/media/shared';
import { useThumbnails } from './waveform/useThumbnails';
import { useTranslate } from '~/i18n/useTranslate';
import type { TimelineThumbnailSlot } from './composables/timeline-viewport';
import type { AudioWaveformStatus } from './composables/useCompositionAudioWaveforms';
import WaveformCanvas from './waveform/WaveformCanvas.vue';

const { t } = useTranslate('TimelineTracks');
const props = defineProps<{
  clip: Clip;
  asset?: MediaAsset | null;
  duration: number;
  thumbnailSlots: readonly TimelineThumbnailSlot[];
  selected: boolean;
  waveformBars?: number[];
  waveformLeftPercent?: number;
  waveformWidthPercent?: number;
  waveformLoadingSegments?: Array<{ leftPercent: number; widthPercent: number }>;
  waveformStatus?: AudioWaveformStatus;
  waveformError?: MediaError;
  trimState?: { edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null;
  deferThumbnailRequests?: boolean;
}>();
const emit = defineEmits<{
  (event: 'select'): void;
  (event: 'move', value: PointerEvent): void;
  (event: 'trim', value: { event: PointerEvent; edge: 'start' | 'end' }): void;
}>();

const videoAsset = computed(() => (props.clip.kind !== 'audio' && props.asset?.kind === 'video' ? props.asset : null));
const { thumbnails, requestVisibleFrames } = useThumbnails(videoAsset);
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
    const sourceMs = props.clip.sourceInMs + (timelineMs - props.clip.timelineStartMs) * props.clip.playbackRate;
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
// Moving a clip changes only its timeline placement. The thumbnail content is
// still the same source segment, so do not replace it (or show skeletons) on a
// move commit. Refresh only when the viewport or source timing actually changes.
const thumbnailRefreshKey = computed(() =>
  [
    props.thumbnailSlots.map((slot) => `${slot.timelineSeconds}:${slot.durationSeconds}`).join(','),
    props.asset?.src ?? '',
    props.clip.sourceInMs,
    props.clip.sourceDurationMs,
    props.clip.playbackRate,
  ].join('|'),
);
watch(
  [thumbnailRefreshKey, () => props.deferThumbnailRequests],
  () => {
    if (props.deferThumbnailRequests) return;
    const value = frames.value;
    frozenFrames.value = value;
    requestVisibleFrames([...new Set(value.map((frame) => frame.mediaSecond))]);
  },
  { immediate: true },
);

const clipStyle = computed(() => ({
  left: `${props.duration > 0 ? (props.clip.timelineStartMs / (props.duration * 1_000)) * 100 : 0}%`,
  width: `${props.duration > 0 ? (props.clip.timelineDurationMs / (props.duration * 1_000)) * 100 : 0}%`,
}));
const frameStyle = (frame: TimelineFrame) => ({
  left: `${(frame.relativeMs / Math.max(1, props.clip.timelineDurationMs)) * 100}%`,
  width: `${(frame.durationMs / Math.max(1, props.clip.timelineDurationMs)) * 100}%`,
});
const thumbnailFor = (frame: TimelineFrame) => {
  const exact = thumbnails[frame.mediaSecond];
  if (exact) return exact;
  let nearest: { distance: number; url: string } | null = null;
  for (const [time, url] of Object.entries(thumbnails)) {
    const distance = Math.abs(Number(time) - frame.mediaSecond);
    if (!nearest || distance < nearest.distance) nearest = { distance, url };
  }
  return nearest?.url ?? null;
};
const formatTrimTime = (milliseconds: number) => {
  const seconds = Math.max(0, milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${minutes > 0 ? `${minutes}:` : ''}${wholeSeconds.toString().padStart(2, '0')}.${tenths}s`;
};

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
    :class="[`kind-${clip.kind}`, { selected, disabled: !clip.enabled, 'trim-at-limit': trimState?.atLimit }]"
    :style="clipStyle"
    @click.stop="emit('select')"
    @pointerdown="emit('move', $event)"
    @pointerenter="startMarquee"
    @pointerleave="stopMarqueeForEvent"
  >
    <div v-if="clip.kind === 'audio'" class="waveform" aria-hidden="true">
      <div
        v-if="waveformBars?.length"
        class="waveform-slice"
        :style="{ left: `${waveformLeftPercent ?? 0}%`, width: `${waveformWidthPercent ?? 100}%` }"
      >
        <WaveformCanvas :bars="waveformBars" :selected="selected" />
        <span
          v-for="(segment, index) in waveformLoadingSegments"
          :key="`loading:${index}`"
          class="waveform-segment-loading"
          :style="{ left: `${segment.leftPercent}%`, width: `${segment.widthPercent}%` }"
        />
      </div>
      <span v-else-if="waveformStatus === 'loading'" class="waveform-loading" />
      <span v-else-if="waveformStatus === 'error'" class="waveform-unavailable" :title="waveformError?.message">
        {{ t('waveformUnavailable') }}
      </span>
    </div>
    <div v-else-if="asset?.kind === 'video'" class="thumbnails-track">
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
            alt=""
            draggable="false"
          />
        </Transition>
        <span v-if="!thumbnails[frame.mediaSecond]" class="thumbnail-loading-overlay" />
      </div>
    </div>
    <img
      v-else-if="asset?.kind === 'image' && asset.src"
      :src="asset.src"
      class="image-preview"
      alt=""
      draggable="false"
    />
    <span
      class="trim-handle start"
      :class="{ 'at-limit': trimState?.edge === 'start' && trimState?.atLimit }"
      :title="t('trimStart')"
      @pointerdown.stop="emit('trim', { event: $event, edge: 'start' })"
    >
      <span
        v-if="trimState?.edge === 'start'"
        class="trim-side-badge"
        :class="{ 'at-limit': trimState?.atLimit }"
      >{{ formatTrimTime(trimState.durationMs) }}</span>
    </span>
    <span class="clip-label-overlay">
      <span class="clip-label-text">{{ clip.name }}</span>
      <span v-if="Math.abs(clip.playbackRate - 1) > 0.01" class="speed-badge">{{ clip.playbackRate.toFixed(2) }}×</span>
    </span>
    <span
      class="trim-handle end"
      :class="{ 'at-limit': trimState?.edge === 'end' && trimState?.atLimit }"
      :title="t('trimEnd')"
      @pointerdown.stop="emit('trim', { event: $event, edge: 'end' })"
    >
      <span
        v-if="trimState?.edge === 'end'"
        class="trim-side-badge"
        :class="{ 'at-limit': trimState?.atLimit }"
      >{{ formatTrimTime(trimState.durationMs) }}</span>
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
  box-sizing: border-box;
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
.timeline-clip.kind-caption {
  background: var(--color-track-annotation);
  color: #fff;
}
.timeline-clip.kind-audio {
  background: var(--color-track-audio-light);
}
.thumbnails-track {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}
.thumbnail-frame {
  position: absolute;
  top: 0;
  height: 100%;
  overflow: hidden;
  background: #111;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
}
.thumbnail-img,
.image-preview {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.thumbnail-img {
  position: absolute;
  inset: 0;
}
.thumbnail-crossfade-enter-active,
.thumbnail-crossfade-leave-active {
  transition: opacity 160ms ease;
}
.thumbnail-crossfade-enter-from,
.thumbnail-crossfade-leave-to {
  opacity: 0;
}
.thumbnail-crossfade-leave-active {
  position: absolute;
}
.thumbnail-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgba(0, 0, 0, 0.18);
  pointer-events: none;
  animation: thumbnail-pending 900ms ease-in-out infinite alternate;
}
@keyframes thumbnail-pending {
  to {
    background: rgba(0, 0, 0, 0.32);
  }
}
.waveform {
  position: absolute;
  inset: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1px;
  overflow: hidden;
}
.waveform::before {
  content: '';
  position: absolute;
  z-index: -1;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: rgba(5, 150, 105, 0.32);
}
.waveform-slice {
  position: absolute;
  top: 0;
  bottom: 0;
}
.waveform-segment-loading {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  background: rgba(0, 0, 0, 0.2);
  border-inline: 1px solid rgba(7, 134, 95, 0.42);
  pointer-events: none;
  animation: waveform-segment-pending 700ms ease-in-out infinite alternate;
}
@keyframes waveform-segment-pending {
  to {
    background: rgba(0, 0, 0, 0.34);
  }
}
.waveform-unavailable {
  width: 100%;
  color: var(--text-muted);
  font-size: 9px;
  text-align: center;
}
.waveform-loading {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  background: rgba(7, 134, 95, 0.2);
  animation: waveform-pending 800ms ease-in-out infinite alternate;
}
@keyframes waveform-pending {
  to {
    opacity: 0.45;
  }
}
.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 40;
  width: 6px;
  background: rgba(255, 255, 255, 0.25);
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
}
.trim-handle.end {
  right: 0;
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
.speed-badge {
  flex: none;
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: var(--color-primary);
  color: #fff;
}
</style>
