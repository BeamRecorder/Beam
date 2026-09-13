<script setup lang="ts">
import { onBeforeUnmount, onBeforeUpdate, onUpdated, ref } from 'vue';
import type { ReorderGroupProps } from './reorder-types';

const props = withDefaults(defineProps<ReorderGroupProps>(), {
  itemAttribute: 'data-track-id',
});
const root = ref<HTMLElement | null>(null);
let previousOrder = [...props.order];
let positions: Map<string, DOMRect> | null = null;
const animations = new Map<HTMLElement, Animation>();
const cancelAnimations = () => {
  for (const animation of animations.values()) animation.cancel();
  animations.clear();
};
const children = () =>
  Array.from(root.value?.children ?? []).filter((child): child is HTMLElement => child instanceof HTMLElement);

onBeforeUpdate(() => {
  if (props.order.length === previousOrder.length && props.order.every((id, index) => id === previousOrder[index]))
    return;
  previousOrder = [...props.order];
  positions = null;
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    positions = new Map(
      children().map((child) => [child.getAttribute(props.itemAttribute) ?? '', child.getBoundingClientRect()]),
    );
  }
  // Read the currently painted positions before canceling an interrupted move.
  cancelAnimations();
});
onUpdated(() => {
  if (!positions) return;
  const oldPositions = positions;
  positions = null;
  for (const child of children()) {
    const previous = oldPositions.get(child.getAttribute(props.itemAttribute) ?? '');
    if (!previous) continue;
    const current = child.getBoundingClientRect();
    const scaleX = child.offsetWidth ? current.width / child.offsetWidth : 1;
    const scaleY = child.offsetHeight ? current.height / child.offsetHeight : 1;
    const dx = (previous.left - current.left) / (scaleX || 1);
    const dy = (previous.top - current.top) / (scaleY || 1);
    if (!dx && !dy) continue;
    const animation = child.animate(
      [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
      { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', composite: 'add' },
    );
    animations.set(child, animation);
    animation.onfinish = () => {
      if (animations.get(child) === animation) animations.delete(child);
    };
  }
});
onBeforeUnmount(cancelAnimations);
</script>

<template>
  <div ref="root"><slot /></div>
</template>
