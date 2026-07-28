<script setup lang="ts">
import { computed, onUnmounted, watch } from "vue";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import type { Clip, MediaAsset } from "../composition/composition-types";
import { useThumbnails } from "./waveform/useThumbnails";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("TimelineVideoClip");
const props = defineProps<{
  clip: Clip;
  asset?: MediaAsset | null;
  duration: number;
  visibleSeconds: number[];
  selected: boolean;
}>();
const emit = defineEmits<{
  (event: "select"): void;
  (event: "move", value: PointerEvent): void;
  (event: "trim", value: { event: PointerEvent; edge: "start" | "end" }): void;
}>();

const source = computed(() => props.asset?.kind === "video" ? props.asset.src : null);
const { thumbnails, requestVisibleFrames } = useThumbnails(source);
const clipEndMs = computed(() => props.clip.timelineStartMs + props.clip.timelineDurationMs);
const frames = computed(() => props.visibleSeconds.flatMap((timelineSecond) => {
  const timelineMs = timelineSecond * 1_000;
  if (timelineMs < props.clip.timelineStartMs || timelineMs >= clipEndMs.value || props.asset?.kind !== "video") return [];
  const sourceMs = props.clip.sourceInMs + (timelineMs - props.clip.timelineStartMs) * props.clip.playbackRate;
  return [{ timelineSecond, mediaSecond: Math.max(0, Math.floor(sourceMs / 1_000)) }];
}));
watch(frames, (value) => requestVisibleFrames([...new Set(value.map((frame) => frame.mediaSecond))]), { immediate: true });

const clipStyle = computed(() => ({
  left: `${props.duration > 0 ? props.clip.timelineStartMs / (props.duration * 10) : 0}%`,
  width: `${props.duration > 0 ? props.clip.timelineDurationMs / (props.duration * 10) : 0}%`,
}));
const frameStyle = (frame: { timelineSecond: number }) => ({
  left: `${((frame.timelineSecond * 1_000 - props.clip.timelineStartMs) / Math.max(1, props.clip.timelineDurationMs)) * 100}%`,
  width: `${(1_000 / Math.max(1, props.clip.timelineDurationMs)) * 100}%`,
});
const waveformBars = computed(() => Array.from({ length: 72 }, (_, index) =>
  Math.max(3, Math.round((Math.abs(Math.sin(index * .71)) * .72 + Math.abs(Math.cos(index * .19)) * .28) * 22)),
));
let marqueeFrame = 0;
let marqueeTimer = 0;
const stopMarquee = (target?: HTMLElement) => {
  window.cancelAnimationFrame(marqueeFrame);
  window.clearTimeout(marqueeTimer);
  marqueeFrame = 0;
  marqueeTimer = 0;
  const label = target?.querySelector<HTMLElement>(".clip-label-text");
  if (label) label.style.transform = "";
};
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
    @pointerleave="stopMarquee($event.currentTarget)"
  >
    <div v-if="asset?.kind === 'video'" class="thumbnails-track">
      <div v-for="frame in frames" :key="`${frame.timelineSecond}:${frame.mediaSecond}`" class="thumbnail-frame" :style="frameStyle(frame)">
        <img v-if="thumbnails[frame.mediaSecond]" :src="thumbnails[frame.mediaSecond]" class="thumbnail-img" alt="" draggable="false" />
        <Skeleton v-else width="100%" height="100%" radius="0" />
      </div>
    </div>
    <img v-else-if="asset?.kind === 'image' && asset.src" :src="asset.src" class="image-preview" alt="" draggable="false" />
    <div v-else-if="clip.kind === 'audio'" class="waveform" aria-hidden="true">
      <span v-for="(height, index) in waveformBars" :key="index" :style="{ height: `${height}px` }" />
    </div>
    <span class="trim-handle start" :title="t('trimStart')" @pointerdown.stop="emit('trim', { event: $event, edge: 'start' })" />
    <span class="clip-label-overlay">
      <span class="clip-label-text">{{ clip.name }}</span>
      <span v-if="Math.abs(clip.playbackRate - 1) > .01" class="speed-badge">{{ clip.playbackRate.toFixed(2) }}×</span>
    </span>
    <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="emit('trim', { event: $event, edge: 'end' })" />
  </button>
</template>

<style scoped>
.timeline-clip { position: absolute; inset-block: 4px; min-width: 14px; padding: 0; border: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--color-bg-surface); cursor: grab; isolation: isolate; }
.timeline-clip:active { cursor: grabbing; }
.timeline-clip.disabled { opacity: .42; }
.timeline-clip::after { content: ''; position: absolute; inset: 0; z-index: 30; box-sizing: border-box; border: 1px solid rgba(255,255,255,.14); border-radius: inherit; pointer-events: none; }
.timeline-clip.selected::after { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
.timeline-clip.kind-caption { background: color-mix(in srgb, var(--color-warning, #d99b00) 20%, var(--color-bg-surface)); }
.timeline-clip.kind-audio { background: color-mix(in srgb, #10b981 12%, var(--color-bg-surface)); }
.thumbnails-track { position: relative; z-index: 1; width: 100%; height: 100%; }
.thumbnail-frame { position: absolute; top: 0; height: 100%; overflow: hidden; background: var(--color-bg-surface); border-right: 1px solid rgba(0,0,0,.08); }
.thumbnail-img, .image-preview { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.waveform { position: absolute; inset: 0 7px; display: flex; align-items: center; gap: 2px; overflow: hidden; opacity: .8; }
.waveform span { flex: 0 0 2px; border-radius: 2px; background: #10b981; }
.trim-handle { position: absolute; top: 0; bottom: 0; z-index: 40; width: 6px; background: rgba(255,255,255,.25); cursor: col-resize; }
.trim-handle.start { left: 0; }.trim-handle.end { right: 0; }
.clip-label-overlay { position: absolute; z-index: 35; left: 8px; top: 3px; display: flex; align-items: center; gap: 5px; max-width: calc(100% - 16px); overflow: hidden; white-space: nowrap; padding: 2px 5px; border: 1px solid rgba(255,255,255,.16); border-radius: var(--radius-sm); background: rgba(12,14,20,.72); backdrop-filter: blur(6px); color: #fff; font-size: 9px; font-weight: 800; line-height: 1.1; text-shadow: 0 1px 2px rgba(0,0,0,.9); }
.clip-label-text { display: inline-block; min-width: 0; white-space: nowrap; transition: transform .05s linear; }
.speed-badge { flex: none; color: #ffd8c8; }
</style>
