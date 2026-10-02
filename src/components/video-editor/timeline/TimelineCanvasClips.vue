<script setup lang="ts">
import { computed } from 'vue';
import type { Clip } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineCanvasClip from './TimelineCanvasClip.vue';
import TimelineCanvasLane from './TimelineCanvasLane.vue';
import { useTimelineCanvasRegistry } from './timeline-canvas-registry';
import type { TimelineVisualClipsProps } from './timeline-canvas-types';
const props = defineProps<TimelineVisualClipsProps>();
const emit = defineEmits<{
  select: [event: MouseEvent, clip: Clip];
  move: [event: PointerEvent, clip: Clip];
  contextmenu: [event: MouseEvent, clip: Clip];
  trim: [event: PointerEvent, clip: Clip, edge: 'start' | 'end'];
}>();
const registry = useTimelineCanvasRegistry();
const { t } = useTranslate('TimelineTracks');
const items = computed(() =>
  props.clips.map((clip) => ({
    clip: props.displayedClip(clip),
    label:
      clip.kind === 'audio'
        ? ''
        : (props.labelFor?.(clip) ??
          ('freezeFrameSourceMs' in clip
            ? t('holdSegment')
            : (clip.kind === 'shape' ? clip.text?.content.trim() : '') || clip.name)),
    labelInset: (clip.locked ? 15 : 0) + (clip.kind === 'blur' ? 15 : 0) + (props.linkedNames(clip).length ? 15 : 0),
    selected: props.selectedIds.has(clip.id),
    pasteHighlight: props.pasteId === clip.id,
  })),
);
</script>
<template>
  <TimelineCanvasLane
    :items="items"
    :duration-ms="durationMs"
    :width="width"
    :viewport="viewport"
    :artworks="registry.artworks.value"
  />
  <TimelineCanvasClip
    v-for="clip in clips"
    :key="clip.id"
    v-bind="audioFor?.(clip.id)"
    :clip="displayedClip(clip)"
    :canvas="canvas"
    :asset="assetFor(clip)"
    :duration="durationMs / 1000"
    :timeline-width-px="width"
    :thumbnail-slots="thumbnailSlots"
    :defer-thumbnail-requests="deferMedia"
    :defer-waveform-draw="deferMedia"
    :selected="selectedIds.has(clip.id)"
    :linked-clip-names="linkedNames(clip)"
    :trim-state="trimStateFor(clip.id)"
    :paste-highlight="pasteId === clip.id"
    @select="emit('select', $event, clip)"
    @contextmenu="emit('contextmenu', $event, clip)"
    @move="emit('move', $event, clip)"
    @trim="emit('trim', $event.event, clip, $event.edge)"
  />
</template>
