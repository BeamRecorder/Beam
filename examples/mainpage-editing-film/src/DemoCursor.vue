<script setup lang="ts">
import { ref } from 'vue';
import { cursorGeometry, resolveCursorAsset } from '@beam/engine/shared/cursor-assets';
import { BASE, CURSOR_URLS } from './scene-model';
import {
  BLUR_END,
  BLUR_START,
  BACKGROUND_BLUR_START,
  BACKGROUND_BLUR_END,
  CURSOR_SIZE,
  SHAPE_END,
  SHAPE_START,
  TRIM_END,
  TRIM_START,
  cursorOpacityAt,
  pressScaleAt,
  progress,
  travel,
  waypoints,
} from './motion';
import type { CursorWaypoint } from './film-types';
const style = ref<Record<string, string>>({ opacity: '0' });
const url = ref(CURSOR_URLS.get('default'));
const anchors = new Map<string, DOMRect>();
function prime() {
  for (const waypoint of waypoints) {
    const element = document.querySelector(waypoint.target);
    if (element) anchors.set(waypoint.target, element.getBoundingClientRect());
  }
}
const point = (waypoint: CursorWaypoint) => {
  const element = document.querySelector(waypoint.target);
  const rect = element?.getBoundingClientRect() ?? anchors.get(waypoint.target);
  if (!rect) throw new Error(`Missing cursor target: ${waypoint.target}`);
  if (element) anchors.set(waypoint.target, rect);
  return { x: rect.left + rect.width * (waypoint.x ?? 0.5), y: rect.top + rect.height * (waypoint.y ?? 0.5) };
};
function paint(time: number) {
  const opacity = cursorOpacityAt(time);
  if (opacity === 0) {
    style.value = { opacity: '0' };
    return;
  }
  let index = waypoints.findIndex((waypoint) => waypoint.time > time);
  if (index < 0) index = waypoints.length;
  const before = waypoints[Math.max(0, index - 1)]!,
    after = waypoints[Math.min(waypoints.length - 1, index)]!;
  const start = point(before),
    end = point(after),
    p = before === after ? 0 : travel(progress(time, before.time, after.time));
  const dragging = (time >= SHAPE_START && time <= SHAPE_END) || (time >= BLUR_START && time <= BLUR_END);
  const dragPoint = dragging ? point({ time, target: '.film-selection-layer .is-bottom-right' }) : null;
  const x = dragPoint?.x ?? start.x + (end.x - start.x) * p;
  const y = dragPoint?.y ?? start.y + (end.y - start.y) * p;
  const hovered = document.elementFromPoint(x, y);
  const nativeCursor = hovered ? getComputedStyle(hovered).cursor : 'auto';
  const role = dragging
    ? 'cross'
    : (time >= TRIM_START && time <= TRIM_END) || (time >= BACKGROUND_BLUR_START && time <= BACKGROUND_BLUR_END)
      ? 'resizewesteast'
      : nativeCursor === 'pointer'
        ? 'handpointing'
        : nativeCursor === 'col-resize' || nativeCursor === 'ew-resize'
          ? 'resizewesteast'
          : nativeCursor === 'text'
            ? 'textcursor'
            : nativeCursor === 'move'
              ? 'move'
              : nativeCursor === 'grab'
                ? 'handopen'
                : nativeCursor === 'grabbing'
                  ? 'handgrabbing'
                  : 'default';
  const asset = resolveCursorAsset(BASE.cursorPack!, { packId: BASE.cursorPack!.id, mode: 'fixed', cursorId: role });
  const geometry = cursorGeometry(asset, CURSOR_SIZE);
  const scale = pressScaleAt(time);
  url.value = CURSOR_URLS.get(role)!;
  style.value = {
    opacity: String(opacity),
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    transformOrigin: `${geometry.hotspot.x}px ${geometry.hotspot.y}px`,
    transform: `translate3d(${x - geometry.hotspot.x}px,${y - geometry.hotspot.y}px,0) scale(${scale})`,
  };
}
defineExpose({ paint, prime });
</script>
<template>
  <img class="film-cursor" :src="url" :style="style" :data-nominal-size="CURSOR_SIZE" alt="" aria-hidden="true" />
</template>
<style scoped>
.film-cursor {
  position: fixed;
  z-index: 100000;
  left: 0;
  top: 0;
  pointer-events: none;
  filter: drop-shadow(0 2px 2px #0004);
}
</style>
