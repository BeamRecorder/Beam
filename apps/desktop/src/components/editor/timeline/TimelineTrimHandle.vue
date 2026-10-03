<script setup lang="ts">
import { computed } from 'vue';
import { formatTimelineTrimTime } from './timeline-clip-geometry';
import type { TimelineTrimHandleProps } from './timeline-trim-handle-types';

const props = defineProps<TimelineTrimHandleProps>();
const emit = defineEmits<{ start: [event: PointerEvent] }>();
const active = computed(() => props.state?.edge === props.edge);
</script>

<template>
  <span
    class="trim-handle"
    :class="[edge, { active, 'at-limit': active && state?.atLimit }]"
    :title="title"
    @pointerdown.stop="emit('start', $event)"
  >
    <span v-if="active && state" class="trim-side-badge" :class="{ 'at-limit': state.atLimit }">{{
      formatTimelineTrimTime(state.durationMs)
    }}</span>
  </span>
</template>

<style scoped>
.trim-handle {
  position: absolute;
  inset-block: 0;
  z-index: 40;
  width: var(--timeline-trim-width);
  max-width: 28%;
  cursor: col-resize;
  opacity: var(--timeline-trim-opacity);
  pointer-events: var(--timeline-trim-pointer-events);
  background: var(--color-timeline-trim);
}
.trim-handle.active {
  opacity: 1;
  pointer-events: auto;
}
.trim-handle.start {
  left: 0;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.trim-handle.end {
  right: 0;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.trim-handle:hover {
  background: var(--color-timeline-trim-hover);
}
.trim-handle.at-limit {
  background: var(--color-error);
}
.trim-side-badge {
  position: absolute;
  top: 50%;
  transform: translate3d(0, -50%, 0);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  font-size: 9px;
  font-weight: 800;
  font-family: monospace;
  white-space: nowrap;
  color: var(--color-timeline-media-label-text);
  background: var(--color-timeline-media-label);
  pointer-events: none;
}
.start .trim-side-badge {
  left: 8px;
}
.end .trim-side-badge {
  right: 8px;
}
.trim-side-badge.at-limit {
  color: var(--text-on-error);
  background: var(--color-error);
}
</style>
