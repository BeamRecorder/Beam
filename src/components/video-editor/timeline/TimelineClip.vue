<script setup lang="ts">
import { computed, onUnmounted, watch } from "vue";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import type { Clip, MediaAsset } from "../composition/composition-types";
import { useThumbnails } from "./waveform/useThumbnails";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("TimelineTracks");
const props = defineProps<{
  clip: Clip;
  asset?: MediaAsset | null;
  duration: number;
  visibleSeconds: number[];
  selected: boolean;
  waveformBars?: number[];
  trimState?: { edge: "start" | "end"; durationMs: number } | null;
}>();
const emit = defineEmits<{
  (event: "select"): void;
  (event: "move", value: PointerEvent): void;
  (event: "trim", value: { event: PointerEvent; edge: "start" | "end" }): void;
}>();

const source = computed(() => props.clip.kind !== "audio" && props.asset?.kind === "video" ? props.asset.src : null);
const { thumbnails, requestVisibleFrames } = useThumbnails(source);
const clipEndMs = computed(() => props.clip.timelineStartMs + props.clip.timelineDurationMs);
const frames = computed(() => props.visibleSeconds.flatMap((timelineSecond) => {
  const timelineMs = timelineSecond * 1_000;
  if (props.clip.kind === "audio" || timelineMs < props.clip.timelineStartMs || timelineMs >= clipEndMs.value || props.asset?.kind !== "video") return [];
  const sourceMs = props.clip.sourceInMs + (timelineMs - props.clip.timelineStartMs) * props.clip.playbackRate;
  return [{ timelineSecond, mediaSecond: Math.max(0, Math.floor(sourceMs / 1_000)) }];
}));
watch(frames, (value) => requestVisibleFrames([...new Set(value.map((frame) => frame.mediaSecond))]), { immediate: true });

const clipStyle = computed(() => ({
  left: `${props.duration > 0 ? props.clip.timelineStartMs / (props.duration * 1_000) * 100 : 0}%`,
  width: `${props.duration > 0 ? props.clip.timelineDurationMs / (props.duration * 1_000) * 100 : 0}%`,
}));
const frameStyle = (frame: { timelineSecond: number }) => ({
  left: `${((frame.timelineSecond * 1_000 - props.clip.timelineStartMs) / Math.max(1, props.clip.timelineDurationMs)) * 100}%`,
  width: `${(1_000 / Math.max(1, props.clip.timelineDurationMs)) * 100}%`,
});
const formatTrimTime = (milliseconds: number) => {
  const seconds = Math.max(0, milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${minutes > 0 ? `${minutes}:` : ""}${wholeSeconds.toString().padStart(2, "0")}.${tenths}s`;
};

let marqueeFrame = 0;
let marqueeTimer = 0;
const stopMarquee = (target?: HTMLElement | null) => {
  window.cancelAnimationFrame(marqueeFrame);
  window.clearTimeout(marqueeTimer);
  marqueeFrame = 0;
  marqueeTimer = 0;
  const label = target?.querySelector<HTMLElement>(".clip-label-text");
  if (label) label.style.transform = "";
};
const stopMarqueeForEvent = (event: PointerEvent) => stopMarquee(event.currentTarget as HTMLElement | null);
const startMarquee = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement;
  const label = target.querySelector<HTMLElement>(".clip-label-text");
  if (!label) return;
  const distance = label.scrollWidth - label.clientWidth;
  if (distance <= 0) return;
  stopMarquee(target);
  marqueeTimer = window.setTimeout(() => {
    const startedAt = performance.now();
    const travelMs = Math.max(3_000, distance / 36 * 1_000);
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
    :class="[`kind-${clip.kind}`, { selected, disabled: !clip.enabled }]"
    :style="clipStyle"
    @click.stop="emit('select')"
    @pointerdown="emit('move', $event)"
    @pointerenter="startMarquee"
    @pointerleave="stopMarqueeForEvent"
  >
    <div v-if="clip.kind === 'audio'" class="waveform" aria-hidden="true">
      <span v-for="(height, index) in waveformBars" :key="index" :style="{ height: `${height}px` }" />
      <span v-if="!waveformBars?.length" class="waveform-unavailable">{{ t('waveformUnavailable') }}</span>
    </div>
    <div v-else-if="asset?.kind === 'video'" class="thumbnails-track">
      <div v-for="frame in frames" :key="`${frame.timelineSecond}:${frame.mediaSecond}`" class="thumbnail-frame" :style="frameStyle(frame)">
        <img v-if="thumbnails[frame.mediaSecond]" :src="thumbnails[frame.mediaSecond]" class="thumbnail-img" alt="" draggable="false" />
        <Skeleton v-else width="100%" height="100%" radius="0" />
      </div>
    </div>
    <img v-else-if="asset?.kind === 'image' && asset.src" :src="asset.src" class="image-preview" alt="" draggable="false" />
    <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="emit('trim', { event: $event, edge: 'start' })">
      <span v-if="trimState?.edge === 'start'" class="trim-side-badge">{{ formatTrimTime(trimState.durationMs) }}</span>
    </span>
    <span class="clip-label-overlay">
      <span class="clip-label-text">{{ clip.name }}</span>
      <span v-if="Math.abs(clip.playbackRate - 1) > .01" class="speed-badge">{{ clip.playbackRate.toFixed(2) }}×</span>
    </span>
    <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="emit('trim', { event: $event, edge: 'end' })">
      <span v-if="trimState?.edge === 'end'" class="trim-side-badge">{{ formatTrimTime(trimState.durationMs) }}</span>
    </span>
  </button>
</template>

<style scoped>
.timeline-clip { position: absolute; top: 2px; bottom: 2px; min-width: 14px; padding: 0; border: 1px solid transparent; border-radius: var(--radius-sm); overflow: hidden; background: var(--color-bg-surface); color: var(--text-primary); cursor: grab; isolation: isolate; box-sizing: border-box; }
.timeline-clip:active { cursor: grabbing; }
.timeline-clip:hover { border-color: var(--color-primary); }
.timeline-clip.disabled { opacity: .42; }
.timeline-clip.selected { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
.timeline-clip.kind-caption { background: var(--color-track-annotation); color: #fff; }
.timeline-clip.kind-audio { background: var(--color-track-audio-light); }
.thumbnails-track { position: relative; z-index: 1; width: 100%; height: 100%; }
.thumbnail-frame { position: absolute; top: 0; height: 100%; overflow: hidden; background: var(--color-bg-surface); border-right: 1px solid rgba(0,0,0,.08); }
.thumbnail-img, .image-preview { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.waveform { position: absolute; inset: 0 7px; display: flex; align-items: center; justify-content: space-between; gap: 2px; overflow: hidden; opacity: .78; }
.waveform > span:not(.waveform-unavailable) { flex: 1 1 auto; max-width: 4px; min-width: 1px; border-radius: 2px; background: var(--color-track-audio); }
.waveform-unavailable { width: 100%; color: var(--text-muted); font-size: 9px; text-align: center; }
.trim-handle { position: absolute; top: 0; bottom: 0; z-index: 40; width: 6px; background: rgba(255,255,255,.25); cursor: col-resize; transition: background var(--fast) ease; }
.trim-handle:hover { background: var(--color-primary); }
.trim-handle.start { left: 0; }.trim-handle.end { right: 0; }
.trim-side-badge { position: absolute; top: 50%; transform: translateY(-50%); padding: 1px 5px; border-radius: var(--radius-sm); background: var(--color-primary); color: #fff; font-size: 9px; font-weight: 800; font-family: monospace; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
.trim-handle.start .trim-side-badge { left: 8px; }.trim-handle.end .trim-side-badge { right: 8px; }
.clip-label-overlay { position: absolute; z-index: 35; left: 8px; top: 2px; display: flex; align-items: center; gap: 5px; max-width: calc(100% - 16px); overflow: hidden; white-space: nowrap; padding: 1px 5px; border-radius: var(--radius-sm); background: rgba(0,0,0,.6); color: #fff; font-size: 9px; font-weight: 800; line-height: 1.1; pointer-events: none; }
.clip-label-text { display: inline-block; min-width: 0; white-space: nowrap; transition: transform .05s linear; }
.speed-badge { flex: none; padding: 1px 4px; border-radius: var(--radius-xs); background: var(--color-primary); color: #fff; }
</style>
