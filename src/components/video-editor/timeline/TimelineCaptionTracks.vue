<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { Sparkles } from '@lucide/vue';
import type { CaptionClip } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import type { TimelinePasteHighlight } from './composables/timeline-clipboard-types';
import { timelineTransitionStyle } from './timeline-clip-geometry';
import TimelineTransitionCurve from './TimelineTransitionCurve.vue';
import type { TextCaptionLayer } from '../composition/engine/caption-layer-layout';

const { t } = useTranslate('TimelineTracks');
const props = defineProps<{
  keyboardClips: CaptionClip[];
  textLayers: TextCaptionLayer[];
  draggedCaptionId?: string | null;
  selectedClipId: string | null;
  selectedClipIds: string[];
  hoverCaptionTimeMs: number | null;
  hoverCaptionDurationMs: number;
  percentageStyle: (startMs: number, durationMs: number) => Record<string, string>;
  displayedClip: (clip: CaptionClip) => Pick<CaptionClip, 'timelineStartMs' | 'timelineDurationMs'>;
  trimStateFor: (clipId: string) => { edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null;
  beginClipMove: (event: PointerEvent, clip: CaptionClip) => void;
  beginClipTrim: (event: PointerEvent, clip: CaptionClip, edge: 'start' | 'end') => void;
  hoverAt: (event: MouseEvent, kind: 'caption') => void;
  leaveTrack: (kind: 'caption') => void;
  addAt: (event: MouseEvent, kind: 'caption') => void;
  recentPaste?: TimelinePasteHighlight | null;
  reduceMotion?: boolean;
}>();

const emit = defineEmits<{
  (event: 'select', clipId: string): void;
  (event: 'contextmenu:clip', payload: { event: MouseEvent; clip: CaptionClip }): void;
  (event: 'contextmenu:track', mouseEvent: MouseEvent): void;
}>();

const hoveredTextLayerId = ref<string | null>(null);
const hoverTextLayer = (event: MouseEvent, clipId: string) => {
  hoveredTextLayerId.value = clipId;
  props.hoverAt(event, 'caption');
};
const leaveTextLayer = () => {
  hoveredTextLayerId.value = null;
  props.leaveTrack('caption');
};

const getCaptionText = (clip: CaptionClip): string => {
  if (clip.caption.type === 'text') {
    const custom = clip.caption.style?.customText?.trim();
    if (custom) return custom;
    const sentences = clip.caption.sentences;
    if (Array.isArray(sentences) && sentences.length > 0) {
      const text = sentences
        .map((s) => s.text)
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) return text;
    }
    if (clip.name && clip.name !== 'Caption' && clip.name !== 'Text Captions') {
      return clip.name;
    }
    return t('textCaptions') || 'Caption';
  }

  if (clip.name && clip.name !== 'Keyboard Captions') {
    return clip.name;
  }
  if (clip.caption.type === 'keyboard' && Array.isArray(clip.caption.steps) && clip.caption.steps.length > 0) {
    return clip.caption.steps.map((s) => (s.modifiers.length ? `${s.modifiers.join('+')}+${s.key}` : s.key)).join(' ');
  }
  return t('keyboardCaptions') || 'Keyboard';
};

const settlingClipIds = ref<Set<string>>(new Set());
const settleTimers: Record<string, number> = {};
const previousTexts: Record<string, string> = {};

let isInitialMount = true;
const SETTLE_ANIMATION_MS = 320;

watch(
  () =>
    [...props.textLayers.flatMap((layer) => layer.clips), ...props.keyboardClips].map((clip) => ({
      id: clip.id,
      text: getCaptionText(clip),
    })),
  (newItems) => {
    if (isInitialMount) {
      for (const item of newItems) {
        previousTexts[item.id] = item.text;
      }
      isInitialMount = false;
      return;
    }

    const currentIds = new Set(newItems.map((item) => item.id));
    for (const id of Object.keys(previousTexts)) {
      if (currentIds.has(id)) continue;
      delete previousTexts[id];
      if (settleTimers[id]) window.clearTimeout(settleTimers[id]);
      delete settleTimers[id];
      settlingClipIds.value.delete(id);
    }

    for (const item of newItems) {
      if (previousTexts[item.id] !== undefined && previousTexts[item.id] !== item.text) {
        settlingClipIds.value.add(item.id);
        if (settleTimers[item.id]) {
          window.clearTimeout(settleTimers[item.id]);
        }
        settleTimers[item.id] = window.setTimeout(() => {
          settlingClipIds.value.delete(item.id);
          delete settleTimers[item.id];
        }, SETTLE_ANIMATION_MS);
      }
      previousTexts[item.id] = item.text;
    }
  },
  { deep: true, immediate: true },
);

let marqueeFrame = 0;
let marqueeTimer = 0;

const stopMarquee = (target?: HTMLElement | null) => {
  window.cancelAnimationFrame(marqueeFrame);
  window.clearTimeout(marqueeTimer);
  marqueeFrame = 0;
  marqueeTimer = 0;
  const label = target?.querySelector<HTMLElement>('.caption-label-text');
  if (label) {
    label.style.transform = '';
    label.classList.remove('is-marqueeing');
  }
};

const stopMarqueeForEvent = (event: PointerEvent) => stopMarquee(event.currentTarget as HTMLElement | null);

const startMarquee = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement;
  const container = target.querySelector<HTMLElement>('.clip-center-title');
  const label = target.querySelector<HTMLElement>('.caption-label-text');
  if (!container || !label) return;
  label.classList.add('is-marqueeing');
  const distance = label.scrollWidth - container.clientWidth;
  if (distance <= 0) {
    label.classList.remove('is-marqueeing');
    return;
  }
  stopMarquee(target);
  label.classList.add('is-marqueeing');
  marqueeTimer = window.setTimeout(() => {
    const startedAt = performance.now();
    const travelMs = Math.max(3_000, (distance / 36) * 1_000);
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs;
      label.style.transform = `translateX(${-distance * (phase <= 1 ? phase : 2 - phase)}px)`;
      marqueeFrame = window.requestAnimationFrame(tick);
    };
    marqueeFrame = window.requestAnimationFrame(tick);
  }, 250);
};

onUnmounted(() => {
  stopMarquee();
  for (const timer of Object.values(settleTimers)) {
    window.clearTimeout(timer);
  }
});
</script>

<template>
  <div
    v-if="keyboardClips.length"
    class="track-row annotation-track keyboard-caption-track"
    :class="{ 'motion-reduced': reduceMotion }"
    @contextmenu="emit('contextmenu:track', $event)"
  >
    <div class="track-content annotation-content">
      <TransitionGroup name="caption-item">
        <button
          v-for="clip in keyboardClips"
          :key="clip.id"
          type="button"
          class="annotation-indicator"
          :class="{
            selected: selectedClipIds.includes(clip.id) || selectedClipId === clip.id,
            disabled: !clip.enabled,
            'paste-arrival': recentPaste?.type === 'clip' && recentPaste.id === clip.id,
          }"
          :style="percentageStyle(displayedClip(clip).timelineStartMs, displayedClip(clip).timelineDurationMs)"
          @click.stop="emit('select', clip.id)"
          @contextmenu.prevent.stop="emit('contextmenu:clip', { event: $event, clip })"
          @pointerdown="beginClipMove($event, clip)"
          @pointerenter="startMarquee"
          @pointerleave="stopMarqueeForEvent"
        >
          <span
            v-if="clip.transitions?.entry"
            class="transition-zone entry"
            :style="timelineTransitionStyle(clip, 'entry')"
            aria-hidden="true"
          >
            <TimelineTransitionCurve edge="entry" :transition="clip.transitions.entry" />
          </span>
          <span
            v-if="clip.transitions?.exit"
            class="transition-zone exit"
            :style="timelineTransitionStyle(clip, 'exit')"
            aria-hidden="true"
          >
            <TimelineTransitionCurve edge="exit" :transition="clip.transitions.exit" />
          </span>
          <span
            class="trim-handle start"
            :title="t('trimStart')"
            @pointerdown.stop="beginClipTrim($event, clip, 'start')"
          >
            <span v-if="trimStateFor(clip.id)?.edge === 'start'" class="trim-side-badge">
              {{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s
            </span>
          </span>
          <span class="clip-center-title">
            <span class="caption-label-text" :class="{ 'caption-settled': settlingClipIds.has(clip.id) }">{{
              getCaptionText(clip)
            }}</span>
          </span>
          <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')">
            <span v-if="trimStateFor(clip.id)?.edge === 'end'" class="trim-side-badge">
              {{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s
            </span>
          </span>
        </button>
      </TransitionGroup>
    </div>
  </div>

  <TransitionGroup v-if="textLayers.length" name="track-reorder" tag="div" class="text-caption-layers-group">
    <div
      v-for="layer in textLayers"
      :key="layer.id"
      class="track-row annotation-track text-caption-track text-caption-layer"
      :data-caption-id="layer.id"
      :class="{ 'motion-reduced': reduceMotion, dragging: draggedCaptionId === layer.id }"
      @contextmenu="emit('contextmenu:track', $event)"
    >
      <div
        class="track-content annotation-content"
        :title="t('clickToAddCaption')"
        @pointerdown.stop
        @mousemove="hoverTextLayer($event, layer.id)"
        @mouseleave="leaveTextLayer"
        @click.stop="addAt($event, 'caption')"
      >
        <div
          v-if="hoverCaptionTimeMs !== null && hoveredTextLayerId === layer.id"
          class="annotation-indicator preview-ghost"
          :style="percentageStyle(hoverCaptionTimeMs, hoverCaptionDurationMs)"
        >
          {{ t('addCaption') }}
        </div>
        <button
          v-for="clip in layer.clips"
          :key="clip.id"
          type="button"
          class="annotation-indicator"
          :class="{
            selected: selectedClipIds.includes(clip.id) || selectedClipId === clip.id,
            disabled: !clip.enabled,
            'paste-arrival': recentPaste?.type === 'clip' && recentPaste.id === clip.id,
          }"
          :style="percentageStyle(displayedClip(clip).timelineStartMs, displayedClip(clip).timelineDurationMs)"
          @click.stop="emit('select', clip.id)"
          @contextmenu.prevent.stop="emit('contextmenu:clip', { event: $event, clip })"
          @pointerdown="beginClipMove($event, clip)"
          @pointerenter="startMarquee"
          @pointerleave="stopMarqueeForEvent"
        >
          <span
            v-if="clip.transitions?.entry"
            class="transition-zone entry"
            :style="timelineTransitionStyle(clip, 'entry')"
            aria-hidden="true"
          >
            <TimelineTransitionCurve edge="entry" :transition="clip.transitions.entry" />
          </span>
          <span
            v-if="clip.transitions?.exit"
            class="transition-zone exit"
            :style="timelineTransitionStyle(clip, 'exit')"
            aria-hidden="true"
          >
            <TimelineTransitionCurve edge="exit" :transition="clip.transitions.exit" />
          </span>
          <span
            class="trim-handle start"
            :title="t('trimStart')"
            @pointerdown.stop="beginClipTrim($event, clip, 'start')"
          >
            <span v-if="trimStateFor(clip.id)?.edge === 'start'" class="trim-side-badge">
              {{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s
            </span>
          </span>
          <span class="clip-center-title">
            <Sparkles v-if="clip.isAiGenerated" :size="12" class="sparkles-icon" />
            <span class="caption-label-text" :class="{ 'caption-settled': settlingClipIds.has(clip.id) }">{{
              getCaptionText(clip)
            }}</span>
          </span>
          <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')">
            <span v-if="trimStateFor(clip.id)?.edge === 'end'" class="trim-side-badge">
              {{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s
            </span>
          </span>
        </button>
      </div>
    </div>
  </TransitionGroup>
  <div
    v-else
    class="track-row annotation-track text-caption-track"
    :class="{ 'motion-reduced': reduceMotion }"
    @contextmenu="emit('contextmenu:track', $event)"
  >
    <div
      class="track-content annotation-content"
      :title="t('clickToAddCaption')"
      @pointerdown.stop
      @mousemove="hoverTextLayer($event, 'empty')"
      @mouseleave="leaveTextLayer"
      @click.stop="addAt($event, 'caption')"
    >
      <div
        v-if="hoverCaptionTimeMs !== null"
        class="annotation-indicator preview-ghost"
        :style="percentageStyle(hoverCaptionTimeMs, hoverCaptionDurationMs)"
      >
        {{ t('addCaption') }}
      </div>
    </div>
  </div>
</template>

<style scoped src="./timeline-caption-tracks.css"></style>
