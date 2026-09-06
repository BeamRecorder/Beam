<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { TimelineSelectionIds } from './composables/timeline-tracks-types';
import type { BoxSelectionGesture, SelectionBounds, SelectionTarget } from './composables/timeline-box-selection-types';
import { timelineVisualScale } from './composables/timeline-coordinate-space';
import { createAnimationFrameCoalescer } from './composables/animation-frame-coalescer';

const props = defineProps<{ selection: TimelineSelectionIds }>();
const emit = defineEmits<{ select: [selection: TimelineSelectionIds]; start: [] }>();
const root = ref<HTMLDivElement | null>(null);
const bounds = ref<SelectionBounds | null>(null);
let gesture: BoxSelectionGesture | null = null;
let suppressContextMenu = false;
let replayingContextMenu = false;
const boxStyle = computed(
  () =>
    bounds.value && {
      transform: `translate3d(${bounds.value.x}px, ${bounds.value.y}px, 0)`,
      width: `${bounds.value.width}px`,
      height: `${bounds.value.height}px`,
    },
);
const point = (event: MouseEvent) => {
  const rect = root.value!.getBoundingClientRect();
  const scale = timelineVisualScale(root.value, rect.width);
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
};
const collectTargets = (): SelectionTarget[] => {
  const rect = root.value!.getBoundingClientRect();
  const scale = timelineVisualScale(root.value, rect.width);
  return Array.from(
    root.value!.querySelectorAll<HTMLElement>('[data-timeline-clip-id], [data-timeline-zoom-id]'),
  ).flatMap((element) => {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return [];
    const kind = element.dataset.timelineClipId ? 'clip' : 'zoom';
    const id = element.dataset.timelineClipId ?? element.dataset.timelineZoomId!;
    return [
      {
        kind,
        id,
        x: (box.left - rect.left) / scale,
        y: (box.top - rect.top) / scale,
        width: box.width / scale,
        height: box.height / scale,
      },
    ];
  });
};
const update = (event: PointerEvent) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  if (
    !gesture.dragged &&
    Math.hypot(event.clientX - gesture.clientOrigin.x, event.clientY - gesture.clientOrigin.y) < 4
  )
    return;
  if (!gesture.dragged) {
    gesture.dragged = true;
    emit('start');
  }
  const current = point(event);
  const box = {
    x: Math.min(current.x, gesture.origin.x),
    y: Math.min(current.y, gesture.origin.y),
    width: Math.abs(current.x - gesture.origin.x),
    height: Math.abs(current.y - gesture.origin.y),
  };
  bounds.value = box;
  const hits = gesture.targets.filter(
    (target) =>
      target.x < box.x + box.width &&
      target.x + target.width > box.x &&
      target.y < box.y + box.height &&
      target.y + target.height > box.y,
  );
  const selection = {
    clipIds: [
      ...new Set([
        ...(gesture.additive ? gesture.initial.clipIds : []),
        ...hits.filter((hit) => hit.kind === 'clip').map((hit) => hit.id),
      ]),
    ],
    zoomIds: [
      ...new Set([
        ...(gesture.additive ? gesture.initial.zoomIds : []),
        ...hits.filter((hit) => hit.kind === 'zoom').map((hit) => hit.id),
      ]),
    ],
  };
  if (JSON.stringify(selection) === JSON.stringify(gesture.last)) return;
  gesture.last = selection;
  emit('select', selection);
};
const frame = createAnimationFrameCoalescer(update);
const move = (event: PointerEvent) => {
  if (event.pointerId === gesture?.pointerId) frame.schedule(event);
};
const cleanup = () => {
  frame.cancel();
  gesture = null;
  bounds.value = null;
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', end);
  window.removeEventListener('pointercancel', cancelPointer);
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('blur', cancel);
  window.removeEventListener('resize', cancel);
};
const cancel = () => {
  if (gesture?.dragged) emit('select', gesture.initial);
  cleanup();
};
const cancelPointer = (event: PointerEvent) => {
  if (event.pointerId === gesture?.pointerId) cancel();
};
const keydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  }
};
const end = (event: PointerEvent) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  frame.flush();
  update(event);
  const finished = gesture;
  cleanup();
  if (!finished.dragged && finished.target.isConnected) {
    replayingContextMenu = true;
    try {
      finished.target.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: event.clientX,
          clientY: event.clientY,
        }),
      );
    } finally {
      replayingContextMenu = false;
    }
  }
};
const begin = (event: PointerEvent) => {
  suppressContextMenu = false;
  if (event.button !== 2 || !(event.target instanceof Element)) return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
  suppressContextMenu = true;
  const initial = { clipIds: [...props.selection.clipIds], zoomIds: [...props.selection.zoomIds] };
  gesture = {
    pointerId: event.pointerId,
    origin: point(event),
    clientOrigin: { x: event.clientX, y: event.clientY },
    target: event.target,
    initial,
    last: initial,
    targets: collectTargets(),
    additive: event.shiftKey || event.ctrlKey || event.metaKey,
    dragged: false,
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('keydown', keydown);
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
};
const allowKeyboardContextMenu = (event: KeyboardEvent) => {
  if (!gesture && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) suppressContextMenu = false;
};
const contextMenu = (event: MouseEvent) => {
  if (!replayingContextMenu && suppressContextMenu && event.button === 2) {
    event.preventDefault();
    event.stopPropagation();
  }
};
onBeforeUnmount(cleanup);
</script>

<template>
  <div
    ref="root"
    class="timeline-selection-surface"
    @pointerdown.capture="begin"
    @contextmenu.capture="contextMenu"
    @keydown.capture="allowKeyboardContextMenu"
  >
    <slot />
    <div v-if="bounds" class="timeline-selection-box" :style="boxStyle" aria-hidden="true" />
  </div>
</template>

<style scoped>
.timeline-selection-surface {
  position: relative;
}
.timeline-selection-box {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 30;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  background: var(--color-primary-light);
}
</style>
