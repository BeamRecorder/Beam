<script setup lang="ts">
import { computed } from 'vue';
import type { Clip } from '@beam/engine/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineCanvasClip from './TimelineCanvasClip.vue';
import TimelineCanvasLane from './TimelineCanvasLane.vue';
import { useTimelineCanvasRegistry } from './timeline-canvas-registry';
import type { TimelineVisualClipsProps } from './timeline-canvas-types';
import { timelineMetadataInset } from '@beam/runtime/timeline/timeline-canvas-layout';
const props = defineProps<TimelineVisualClipsProps>();
const emit = defineEmits<{
  select: [event: MouseEvent, clip: Clip];
  move: [event: PointerEvent, clip: Clip];
  contextmenu: [event: MouseEvent, clip: Clip];
  trim: [event: PointerEvent, clip: Clip, edge: 'start' | 'end'];
}>();
const registry = useTimelineCanvasRegistry();
const { t } = useTranslate('TimelineTracks');
// Reuse each displayed clip for the bitmap and its controls. Artwork completion
// rerenders this lane and must not create another timing preview in that render.
const displayedClips = computed(() => props.clips.map((clip) => props.displayedClip(clip)));
const items = computed(() =>
  props.clips.map((clip, index) => ({
    clip: displayedClips.value[index]!,
    label:
      clip.kind === 'audio'
        ? ''
        : (props.labelFor?.(clip) ??
          ('freezeFrameSourceMs' in clip
            ? t('holdSegment')
            : (clip.kind === 'shape' ? clip.text?.content.trim() : '') || clip.name)),
    labelInset: timelineMetadataInset(
      Number(Boolean(clip.locked)) +
        Number(clip.kind === 'blur' || clip.kind === 'screen') +
        Number(props.linkedNames(clip).length > 0) +
        Number(Boolean(registry.artworks.value.get(clip.id)?.error)),
    ),
    labelEndInset: Math.abs(clip.playbackRate - 1) > 0.01 ? 48 : 8,
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
    v-for="(clip, index) in clips"
    :key="clip.id"
    v-bind="audioFor?.(clip.id)"
    :clip="items[index]!.clip"
    :canvas="canvas"
    :asset="assetFor(clip)"
    :duration="durationMs / 1000"
    :timeline-width-px="width"
    :thumbnail-slots="thumbnailSlots"
    :defer-thumbnail-requests="deferMedia"
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
