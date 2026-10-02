<script setup lang="ts">
import ReorderGroup from '~/ui/transitions/ReorderGroup.vue';
import TimelineCanvasLane from './TimelineCanvasLane.vue';
import type { TimelineViewportMetrics } from './composables/timeline-virtualization-types';
import { computed, onUnmounted, ref, watch } from 'vue';
import { Lock, Sparkles } from '@lucide/vue';
import type { CaptionClip } from '@beam/engine/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import type { TimelinePasteHighlight } from './composables/timeline-clipboard-types';
import type { TextCaptionLayer } from '@beam/engine/commands/caption-layer-layout';
import { useTimelineVirtualWindow, useVirtualTimelineItems } from './composables/useTimelineVirtualization';

const { t } = useTranslate('TimelineTracks');
const props = defineProps<{
  keyboardClips: CaptionClip[];
  viewport: TimelineViewportMetrics;
  durationMs: number;
  width: number;
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
  (event: 'select', payload: { id: string; event: MouseEvent }): void;
  (event: 'contextmenu:clip', payload: { event: MouseEvent; clip: CaptionClip }): void;
  (event: 'contextmenu:track', mouseEvent: MouseEvent): void;
}>();
const virtualWindow = useTimelineVirtualWindow();
const visibleTextLayers = useVirtualTimelineItems(
  () => props.textLayers,
  (layer) => `caption:${layer.id}`,
);
const isVisible = (id: string) => !virtualWindow || virtualWindow.visibleIds.value.has(id);

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

const laneItems = (clips: CaptionClip[]) =>
  (virtualWindow?.visibleClips(clips) ?? clips).map((clip) => ({
    clip: { ...clip, ...props.displayedClip(clip) },
    label: getCaptionText(clip),
    labelInset: (clip.locked ? 15 : 0) + (clip.isAiGenerated ? 15 : 0),
    selected: props.selectedClipIds.includes(clip.id) || props.selectedClipId === clip.id,
    pasteHighlight: props.recentPaste?.type === 'clip' && props.recentPaste.id === clip.id,
  }));
const keyboardItems = computed(() => laneItems(props.keyboardClips));

const settlingClipIds = ref<Set<string>>(new Set());
const settleTimers: Record<string, number> = {};
const previousTexts: Record<string, string> = {};

let isInitialMount = true;
const SETTLE_ANIMATION_MS = 320;

watch(
  () =>
    [
      ...visibleTextLayers.value.flatMap((layer) => virtualWindow?.visibleClips(layer.clips) ?? layer.clips),
      ...(virtualWindow?.visibleClips(props.keyboardClips) ?? props.keyboardClips),
    ].map((clip) => ({
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
  { immediate: true },
);

onUnmounted(() => {
  for (const timer of Object.values(settleTimers)) {
    window.clearTimeout(timer);
  }
});
</script>

<template>
  <div
    v-if="keyboardClips.length && isVisible('keyboard')"
    data-timeline-row-id="keyboard"
    :style="virtualWindow?.rowStyle('keyboard')"
    class="track-row annotation-track keyboard-caption-track"
    :class="{ 'motion-reduced': reduceMotion }"
    @contextmenu="emit('contextmenu:track', $event)"
  >
    <div class="track-content annotation-content">
      <TimelineCanvasLane
        :items="keyboardItems"
        :duration-ms="durationMs"
        :width="width"
        :viewport="viewport"
        :reduce-motion="reduceMotion"
      />
      <TransitionGroup name="caption-item">
        <button
          v-for="clip in virtualWindow?.visibleClips(keyboardClips) ?? keyboardClips"
          :key="clip.id"
          type="button"
          :data-timeline-clip-id="clip.id"
          class="annotation-indicator canvas-clip-target"
          :class="{
            selected: selectedClipIds.includes(clip.id) || selectedClipId === clip.id,
            disabled: !clip.enabled,
            'paste-arrival': recentPaste?.type === 'clip' && recentPaste.id === clip.id,
          }"
          :style="percentageStyle(displayedClip(clip).timelineStartMs, displayedClip(clip).timelineDurationMs)"
          @click.stop="emit('select', { id: clip.id, event: $event })"
          @contextmenu.prevent.stop="emit('contextmenu:clip', { event: $event, clip })"
          @pointerdown="beginClipMove($event, clip)"
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
            <Lock v-if="clip.locked" :size="12" :aria-label="t('locked')" />
            <span
              class="caption-label-text canvas-semantic-label"
              :class="{ 'caption-settled': settlingClipIds.has(clip.id) }"
              >{{ getCaptionText(clip) }}</span
            >
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

  <ReorderGroup
    v-if="textLayers.length"
    :order="visibleTextLayers.map((layer) => layer.id)"
    item-attribute="data-caption-id"
    class="text-caption-layers-group"
  >
    <div
      v-for="layer in visibleTextLayers"
      :key="layer.id"
      class="track-row annotation-track text-caption-track text-caption-layer"
      :data-caption-id="layer.id"
      :data-timeline-row-id="`caption:${layer.id}`"
      :style="virtualWindow?.rowStyle(`caption:${layer.id}`)"
      :class="{
        'motion-reduced': reduceMotion,
        dragging: draggedCaptionId === layer.id,
      }"
      @contextmenu="emit('contextmenu:track', $event)"
    >
      <div
        class="track-content annotation-content"
        :title="t('clickToAddCaption')"
        @pointerdown.stop
        @mousemove="hoverTextLayer($event, layer.id)"
        @mouseleave="leaveTextLayer"
        @click.stop="addAt($event, 'caption')"
        @dblclick.stop="addAt($event, 'caption')"
      >
        <div
          v-if="hoverCaptionTimeMs !== null && hoveredTextLayerId === layer.id"
          class="annotation-indicator preview-ghost"
          :style="percentageStyle(hoverCaptionTimeMs, hoverCaptionDurationMs)"
        >
          {{ t('addCaption') }}
        </div>
        <TimelineCanvasLane
          :items="laneItems(layer.clips)"
          :duration-ms="durationMs"
          :width="width"
          :viewport="viewport"
          :reduce-motion="reduceMotion"
        />
        <button
          v-for="clip in virtualWindow?.visibleClips(layer.clips) ?? layer.clips"
          :key="clip.id"
          type="button"
          :data-timeline-clip-id="clip.id"
          class="annotation-indicator canvas-clip-target"
          :class="{
            selected: selectedClipIds.includes(clip.id) || selectedClipId === clip.id,
            disabled: !clip.enabled,
            'paste-arrival': recentPaste?.type === 'clip' && recentPaste.id === clip.id,
          }"
          :style="percentageStyle(displayedClip(clip).timelineStartMs, displayedClip(clip).timelineDurationMs)"
          @click.stop="emit('select', { id: clip.id, event: $event })"
          @contextmenu.prevent.stop="emit('contextmenu:clip', { event: $event, clip })"
          @pointerdown="beginClipMove($event, clip)"
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
            <Lock v-if="clip.locked" :size="12" :aria-label="t('locked')" />
            <Sparkles v-if="clip.isAiGenerated" :size="12" class="sparkles-icon" />
            <span
              class="caption-label-text canvas-semantic-label"
              :class="{ 'caption-settled': settlingClipIds.has(clip.id) }"
              >{{ getCaptionText(clip) }}</span
            >
          </span>
          <span class="trim-handle end" :title="t('trimEnd')" @pointerdown.stop="beginClipTrim($event, clip, 'end')">
            <span v-if="trimStateFor(clip.id)?.edge === 'end'" class="trim-side-badge">
              {{ (trimStateFor(clip.id)!.durationMs / 1000).toFixed(1) }}s
            </span>
          </span>
        </button>
      </div>
    </div>
  </ReorderGroup>
  <div
    v-else-if="isVisible('caption:empty')"
    data-timeline-row-id="caption:empty"
    :style="virtualWindow?.rowStyle('caption:empty')"
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
      @dblclick.stop="addAt($event, 'caption')"
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
<style scoped src="./timeline-item-states.css"></style>

<style scoped>
.annotation-indicator.canvas-clip-target {
  background: transparent;
  border: 0;
}
.canvas-semantic-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.clip-center-title {
  justify-content: flex-start;
  padding-left: 8px;
}
</style>
