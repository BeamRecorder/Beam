<script setup lang="ts">
import { computed, onUnmounted, watch } from "vue";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import type { MediaAsset, VisualClip } from "../composition/composition-types";
import { useThumbnails } from "./waveform/useThumbnails";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("TimelineTracks");
const props = defineProps<{
  clip: VisualClip;
  asset: MediaAsset;
  duration: number;
  visibleSeconds: number[];
  selected: boolean;
  trimState?: { edge: "start" | "end"; durationMs: number } | null;
}>();
const emit = defineEmits<{
  (event: "select"): void;
  (event: "move", value: PointerEvent): void;
  (event: "trim", value: { event: PointerEvent; edge: "start" | "end" }): void;
}>();

const source = computed(() => props.asset.kind === "video" ? props.asset.src : null);
const { thumbnails, requestVisibleFrames } = useThumbnails(source);
const clipEndMs = computed(() => props.clip.timelineStartMs + props.clip.timelineDurationMs);
const frames = computed(() => props.visibleSeconds.flatMap((timelineSecond) => {
  const timelineMs = timelineSecond * 1_000;
  if (props.asset.kind !== "video" || timelineMs < props.clip.timelineStartMs || timelineMs >= clipEndMs.value) return [];
  const mediaSecond = Math.max(0, Math.floor((props.clip.sourceInMs + (timelineMs - props.clip.timelineStartMs) * props.clip.playbackRate) / 1_000));
  return [{ timelineSecond, mediaSecond }];
}));
watch(frames, (value) => requestVisibleFrames([...new Set(value.map((frame) => frame.mediaSecond))]), { immediate: true });

const clipStyle = computed(() => ({
  left: `${props.duration > 0 ? props.clip.timelineStartMs / (props.duration * 10) : 0}%`,
  width: `${props.duration > 0 ? props.clip.timelineDurationMs / (props.duration * 10) : 0}%`,
}));
const frameStyle = (frame: { timelineSecond: number }) => ({
  left: `${((frame.timelineSecond * 1_000 - props.clip.timelineStartMs) / Math.max(1, props.clip.timelineDurationMs)) * 100}%`,
  width: `${1_000 / Math.max(1, props.clip.timelineDurationMs) * 100}%`,
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
  cancelAnimationFrame(marqueeFrame);
  clearTimeout(marqueeTimer);
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
      marqueeFrame = requestAnimationFrame(tick);
    };
    marqueeFrame = requestAnimationFrame(tick);
  }, 300);
};
onUnmounted(() => stopMarquee());
</script>

<template>
  <button
    type="button"
    class="timeline-video-clip"
    :class="{ selected, disabled: !clip.enabled }"
    :style="clipStyle"
    @click.stop="emit('select')"
    @pointerdown="emit('select'); emit('move', $event)"
    @pointerenter="startMarquee"
    @pointerleave="stopMarqueeForEvent"
  >
    <div v-if="asset.kind === 'video'" class="thumbnails-track">
      <div v-for="frame in frames" :key="`${frame.timelineSecond}:${frame.mediaSecond}`" class="thumbnail-frame" :style="frameStyle(frame)">
        <img v-if="thumbnails[frame.mediaSecond]" :src="thumbnails[frame.mediaSecond]" class="thumbnail-img" alt="" draggable="false" />
        <Skeleton v-else width="100%" height="100%" radius="0" />
      </div>
    </div>
    <img v-else :src="asset.src" class="thumbnail-img image-preview" alt="" draggable="false" />
    <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="emit('trim', { event: $event, edge: 'start' })">
      <span v-if="trimState?.edge === 'start'" class="trim-side-badge">{{ formatTrimTime(trimState.durationMs) }}</span>
    </span>
    <span class="clip-label-overlay"><span class="clip-label-text">{{ clip.name }}</span></span>
    <span v-if="Math.abs(clip.playbackRate - 1) > .01" class="speed-badge">{{ clip.playbackRate.toFixed(2) }}×</span>
    <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="emit('trim', { event: $event, edge: 'end' })">
      <span v-if="trimState?.edge === 'end'" class="trim-side-badge">{{ formatTrimTime(trimState.durationMs) }}</span>
    </span>
  </button>
</template>

<style scoped>
.timeline-video-clip { position: absolute; inset-block: 0; min-width: 14px; padding: 0; border: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--color-bg-surface); cursor: grab; isolation: isolate; }
.timeline-video-clip:active { cursor: grabbing; }
.timeline-video-clip.disabled { opacity: .38; }
.timeline-video-clip::after { content: ''; position: absolute; inset: 0; z-index: 30; box-sizing: border-box; border: 1px solid rgba(255, 255, 255, .14); border-radius: inherit; pointer-events: none; }
.timeline-video-clip:hover::after { border-color: var(--color-primary); border-style: dashed; }
.timeline-video-clip.selected::after { border-color: var(--color-primary); border-style: solid; box-shadow: inset 0 0 0 1px var(--color-primary); }
.thumbnails-track { position: relative; z-index: 1; width: 100%; height: 100%; }
.thumbnail-frame { position: absolute; top: 0; height: 100%; overflow: hidden; background: var(--color-bg-surface); border-right: 1px solid rgba(0, 0, 0, .08); }
.thumbnail-img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.image-preview { position: absolute; inset: 0; }
.trim-handle { position: absolute; top: 0; bottom: 0; z-index: 40; width: 6px; background: rgba(255, 255, 255, .25); cursor: col-resize; transition: background var(--fast) ease; }
.trim-handle:hover { background: var(--color-primary); }
.trim-handle.start { left: 0; }
.trim-handle.end { right: 0; }
.trim-side-badge { position: absolute; top: 50%; transform: translateY(-50%); padding: 1px 5px; border-radius: var(--radius-sm); background: var(--color-primary); color: #fff; font-size: 9px; font-weight: 800; font-family: monospace; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
.trim-handle.start .trim-side-badge { left: 8px; }
.trim-handle.end .trim-side-badge { right: 8px; }
.clip-label-overlay { position: absolute; z-index: 35; left: 8px; top: 3px; display: block; max-width: calc(100% - 16px); overflow: hidden; white-space: nowrap; padding: 2px 5px; border: 1px solid rgba(255, 255, 255, .16); border-radius: var(--radius-sm); background: rgba(12, 14, 20, .72); backdrop-filter: blur(6px); color: #fff; font-size: 9px; font-weight: 800; line-height: 1.1; text-shadow: 0 1px 2px rgba(0, 0, 0, .9); }
.clip-label-text { display: inline-block; white-space: nowrap; transition: transform .05s linear; }
.speed-badge { position: absolute; z-index: 35; top: 4px; right: 5px; padding: 1px 4px; border-radius: var(--radius-xs); background: var(--color-primary); color: #fff; font-size: 9px; font-weight: 700; }
</style>
