<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { createAnimationFrameCoalescer } from '../timeline/composables/animation-frame-coalescer';
import type {
  CanvasMarqueeBounds,
  CanvasMarqueeGesture,
  CanvasMarqueeSelection,
  CanvasMarqueeTarget,
} from './canvas-marquee-types';

const props = withDefaults(
  defineProps<{
    targets: CanvasMarqueeTarget[];
    selection: string[];
    disabled?: boolean;
    showSelectionOutlines?: boolean;
  }>(),
  { disabled: false, showSelectionOutlines: false },
);
const emit = defineEmits<{ select: [selection: CanvasMarqueeSelection] }>();
const root = ref<HTMLDivElement | null>(null);
const bounds = ref<CanvasMarqueeBounds | null>(null);
let gesture: CanvasMarqueeGesture | null = null;
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
const selectedTargets = computed(() =>
  props.showSelectionOutlines && props.selection.length > 1
    ? props.targets.filter((target) => props.selection.includes(target.id))
    : [],
);
const selectionStyle = (target: CanvasMarqueeTarget) => ({
  width: `${target.width}px`,
  height: `${target.height}px`,
  transform: `translate3d(${target.x}px, ${target.y}px, 0) rotate(${target.rotation ?? 0}deg)`,
});
const point = (event: MouseEvent) => {
  const element = root.value!;
  const rect = element.getBoundingClientRect();
  const logicalWidth = element.clientWidth || element.offsetWidth || rect.width;
  const logicalHeight = element.clientHeight || element.offsetHeight || rect.height;
  return {
    x: ((event.clientX - rect.left) * logicalWidth) / rect.width,
    y: ((event.clientY - rect.top) * logicalHeight) / rect.height,
  };
};
const targetBounds = (target: CanvasMarqueeTarget): CanvasMarqueeBounds => {
  if (!target.rotation) return target;
  const radians = (target.rotation * Math.PI) / 180;
  const width = Math.abs(target.width * Math.cos(radians)) + Math.abs(target.height * Math.sin(radians));
  const height = Math.abs(target.width * Math.sin(radians)) + Math.abs(target.height * Math.cos(radians));
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  };
};
const intersects = (target: CanvasMarqueeTarget, box: CanvasMarqueeBounds) => {
  const targetBox = targetBounds(target);
  return (
    targetBox.x < box.x + box.width &&
    targetBox.x + targetBox.width > box.x &&
    targetBox.y < box.y + box.height &&
    targetBox.y + targetBox.height > box.y
  );
};
const update = (event: PointerEvent) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  if (
    !gesture.dragged &&
    Math.hypot(event.clientX - gesture.clientOrigin.x, event.clientY - gesture.clientOrigin.y) < 4
  )
    return;
  gesture.dragged = true;
  const current = point(event);
  const box = {
    x: Math.min(current.x, gesture.origin.x),
    y: Math.min(current.y, gesture.origin.y),
    width: Math.abs(current.x - gesture.origin.x),
    height: Math.abs(current.y - gesture.origin.y),
  };
  bounds.value = box;
  const hits = gesture.targets.filter((target) => intersects(target, box));
  const foregroundHits = hits.filter((target) => !target.backdrop);
  const chosen = foregroundHits.length ? foregroundHits : hits;
  const ids = [...new Set([...(gesture.additive ? gesture.initial : []), ...chosen.map((target) => target.id)])];
  if (JSON.stringify(ids) === JSON.stringify(gesture.last)) return;
  gesture.last = ids;
  emit('select', {
    ids,
    primaryId: chosen.at(-1)?.id ?? ids.at(-1) ?? null,
    additive: gesture.additive,
  });
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
  if (gesture?.dragged)
    emit('select', {
      ids: gesture.initial,
      primaryId: gesture.initial.at(-1) ?? null,
      additive: false,
    });
  cleanup();
};
const cancelPointer = (event: PointerEvent) => {
  if (event.pointerId === gesture?.pointerId) cancel();
};
const keydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  cancel();
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
  if (props.disabled || event.button !== 2 || !(event.target instanceof Element)) return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
  suppressContextMenu = true;
  const initial = [...props.selection];
  gesture = {
    pointerId: event.pointerId,
    origin: point(event),
    clientOrigin: { x: event.clientX, y: event.clientY },
    target: event.target,
    initial,
    last: initial,
    targets: props.targets.filter((target) => target.width > 0 && target.height > 0),
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
    class="canvas-marquee-surface"
    @pointerdown.capture="begin"
    @contextmenu.capture="contextMenu"
    @keydown.capture="allowKeyboardContextMenu"
  >
    <slot />
    <div
      v-for="target in selectedTargets"
      :key="target.id"
      class="canvas-marquee-selection"
      :style="selectionStyle(target)"
      aria-hidden="true"
    />
    <div v-if="bounds" class="canvas-marquee-box" :style="boxStyle" aria-hidden="true" />
  </div>
</template>

<style scoped>
.canvas-marquee-box {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 45;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  background: var(--color-primary-light);
  pointer-events: none;
}
.canvas-marquee-selection {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 44;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  transform-origin: center;
  pointer-events: none;
}
</style>
