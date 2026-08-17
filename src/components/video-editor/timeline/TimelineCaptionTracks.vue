<script setup lang="ts">
import { Sparkles } from '@lucide/vue';
import type { CaptionClip } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import type { TimelinePasteHighlight } from './composables/timeline-clipboard-types';

const { t } = useTranslate('TimelineTracks');
defineProps<{
  keyboardClips: CaptionClip[];
  textClips: CaptionClip[];
  selectedClipId: string | null;
  recentPaste?: TimelinePasteHighlight | null;
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
}>();
const emit = defineEmits<{
  (event: 'select', clipId: string): void;
  (event: 'contextmenu:clip', payload: { event: MouseEvent; clip: CaptionClip }): void;
  (event: 'contextmenu:track', mouseEvent: MouseEvent): void;
}>();
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
          <span class="clip-center-title">{{ clip.name }}</span>
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
          <span class="clip-center-title"><Sparkles v-if="clip.isAiGenerated" :size="11" />{{ clip.name }}</span>
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
