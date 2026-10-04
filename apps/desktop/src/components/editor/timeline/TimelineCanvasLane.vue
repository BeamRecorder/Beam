<script setup lang="ts">
import { inject, onMounted, onScopeDispose, ref, watch } from 'vue';
import type { TimelineCanvasLaneProps } from './timeline-canvas-types';
import { TIMELINE_SURFACE_KEY } from './timeline-surface-types';
import { useTimelineCanvasMarquee } from './composables/useTimelineCanvasMarquee';
const props = defineProps<TimelineCanvasLaneProps>();
const element = ref<HTMLElement | null>(null);
const surface = inject(TIMELINE_SURFACE_KEY);
if (!surface) throw new Error('Timeline lane requires the shared surface.');
const marquee = useTimelineCanvasMarquee(element, props, surface.invalidate, surface.context, surface.frames);
let release: (() => void) | undefined;
onMounted(() => {
  release = surface.register({ element: element.value!, props, marquee });
});
watch(
  () => [props.items, props.artworks, props.durationMs, props.width, props.viewport.left, props.viewport.width],
  surface.invalidate,
  { flush: 'post' },
);
onScopeDispose(() => release?.());
</script>
<template><div ref="element" class="timeline-canvas-lane" aria-hidden="true" /></template>
<style scoped>
.timeline-canvas-lane {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
