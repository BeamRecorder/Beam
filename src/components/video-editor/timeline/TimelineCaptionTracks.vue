<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { Sparkles } from '@lucide/vue';
import type { CaptionClip } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import Throbber from '~/components/ui/throbber/Throbber.vue';
import type { TimelinePasteHighlight } from './composables/timeline-clipboard-types';

const { t } = useTranslate('TimelineTracks');
const props = defineProps<{
  keyboardClips: CaptionClip[];
  textClips: CaptionClip[];
  selectedClipId: string | null;
  hoverCaptionTimeMs: number | null;
  defaultCaptionDurationMs: number;
  percentageStyle: (startMs: number, durationMs: number) => Record<string, string>;
  displayedClip: (clip: CaptionClip) => Pick<CaptionClip, 'timelineStartMs' | 'timelineDurationMs'>;
  trimStateFor: (clipId: string) => { edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null;
  beginClipMove: (event: PointerEvent, clip: CaptionClip) => void;
  beginClipTrim: (event: PointerEvent, clip: CaptionClip, edge: 'start' | 'end') => void;
  hoverAt: (event: MouseEvent, kind: 'caption') => void;
  leaveTrack: (kind: 'caption') => void;
  addAt: (event: MouseEvent, kind: 'caption') => void;
  recentPaste?: TimelinePasteHighlight | null;
}>();

const emit = defineEmits<{
  (event: 'select', clipId: string): void;
  (event: 'contextmenu:clip', payload: { event: MouseEvent; clip: CaptionClip }): void;
  (event: 'contextmenu:track', mouseEvent: MouseEvent): void;
}>();

const getCaptionText = (clip: CaptionClip): string => {
  if (clip.caption.type === 'text') {
    const custom = clip.caption.style?.customText?.trim();
    if (custom) return custom;
    const sentences = clip.caption.sentences;
    if (Array.isArray(sentences) && sentences.length > 0) {
      const text = sentences.map((s) => s.text).filter(Boolean).join(' ').trim();
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
    return clip.caption.steps
      .map((s) => (s.modifiers.length ? `${s.modifiers.join('+')}+${s.key}` : s.key))
      .join(' ');
  }
  return t('keyboardCaptions') || 'Keyboard';
};

const editingClipIds = ref<Set<string>>(new Set());
const editTimers: Record<string, number> = {};
const previousTexts: Record<string, string> = {};

let isInitialMount = true;

watch(
  () => [...props.textClips, ...props.keyboardClips].map((clip) => ({ id: clip.id, text: getCaptionText(clip) })),
  (newItems) => {
    if (isInitialMount) {
      for (const item of newItems) {
        previousTexts[item.id] = item.text;
      }
      isInitialMount = false;
      return;
    }

    for (const item of newItems) {
      if (previousTexts[item.id] !== undefined && previousTexts[item.id] !== item.text) {
        editingClipIds.value.add(item.id);
        if (editTimers[item.id]) {
          window.clearTimeout(editTimers[item.id]);
        }
        editTimers[item.id] = window.setTimeout(() => {
          editingClipIds.value.delete(item.id);
          delete editTimers[item.id];
        }, 50);
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
  if (label) label.style.transform = '';
};

const stopMarqueeForEvent = (event: PointerEvent) => stopMarquee(event.currentTarget as HTMLElement | null);

const startMarquee = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement;
  const label = target.querySelector<HTMLElement>('.caption-label-text');
  if (!label) return;
  const distance = label.scrollWidth - label.clientWidth;
  if (distance <= 0) return;
  stopMarquee(target);
  marqueeTimer = window.setTimeout(() => {
    const startedAt = performance.now();
    const travelMs = Math.max(2_500, (distance / 32) * 1_000);
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs;
      label.style.transform = `translateX(${-distance * (phase <= 1 ? phase : 2 - phase)}px)`;
      marqueeFrame = window.requestAnimationFrame(tick);
    };
    marqueeFrame = window.requestAnimationFrame(tick);
  }, 300);
};

onUnmounted(() => {
  stopMarquee();
  for (const timer of Object.values(editTimers)) {
    window.clearTimeout(timer);
  }
});
</script>

<template>
  <div
    v-if="keyboardClips.length"
    class="track-row annotation-track keyboard-caption-track"
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
            selected: selectedClipId === clip.id,
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
            class="trim-handle start"
            :title="t('trimStart')"
            @pointerdown.stop="beginClipTrim($event, clip, 'start')"
          >
            <span v-if="trimStateFor(clip.id)?.edge === 'start'" class="trim-side-badge">
              {{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s
            </span>
          </span>
          <span class="clip-center-title">
            <Throbber v-if="editingClipIds.has(clip.id)" variant="wave" size="xs" :dots="true" text="..." />
            <span v-else class="caption-label-text">{{ getCaptionText(clip) }}</span>
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

  <div
    class="track-row annotation-track text-caption-track"
    @contextmenu="emit('contextmenu:track', $event)"
  >
    <div
      class="track-content annotation-content"
      :title="t('clickToAddCaption')"
      @pointerdown.stop
      @mousemove="hoverAt($event, 'caption')"
      @mouseleave="leaveTrack('caption')"
      @click.stop="addAt($event, 'caption')"
    >
      <div
        v-if="hoverCaptionTimeMs !== null"
        class="annotation-indicator preview-ghost"
        :style="percentageStyle(hoverCaptionTimeMs, defaultCaptionDurationMs)"
      >
        {{ t('addCaption') }}
      </div>
      <TransitionGroup name="caption-item">
        <button
          v-for="clip in textClips"
          :key="clip.id"
          type="button"
          class="annotation-indicator"
          :class="{
            selected: selectedClipId === clip.id,
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
            class="trim-handle start"
            :title="t('trimStart')"
            @pointerdown.stop="beginClipTrim($event, clip, 'start')"
          >
            <span v-if="trimStateFor(clip.id)?.edge === 'start'" class="trim-side-badge">
              {{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s
            </span>
          </span>
          <span class="clip-center-title">
            <Sparkles v-if="clip.isAiGenerated" :size="11" class="sparkles-icon" />
            <Throbber v-if="editingClipIds.has(clip.id)" variant="wave" size="xs" :dots="true" text="..." />
            <span v-else class="caption-label-text">{{ getCaptionText(clip) }}</span>
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
</template>

<style scoped src="./timeline-caption-tracks.css"></style>
