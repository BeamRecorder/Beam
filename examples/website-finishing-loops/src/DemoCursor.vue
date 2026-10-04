<script setup lang="ts">
import { computed } from "vue";
import { MACOS_CURSOR_PACK } from "../../../apps/desktop/src/components/editor/properties/cursor/cursor-packs";
import {
  cursorGeometry,
  resolveCursorAsset,
} from "../../../packages/engine/src/shared/cursor-assets";
import { CLICKS, pointerAt, rippleFor, phaseTime } from "./motion";
import type { DemoMode } from "./demo-types";
import arrow from "../assets/macos-arrow.svg";
import hand from "../assets/macos-hand.svg";
const props = defineProps<{ mode: DemoMode; time: number }>();
const cursors = [
  { role: "default", url: arrow },
  { role: "handpointing", url: hand },
].map((cursor) => ({
  ...cursor,
  geometry: cursorGeometry(
    resolveCursorAsset(MACOS_CURSOR_PACK, {
      packId: MACOS_CURSOR_PACK.id,
      mode: "fixed",
      cursorId: cursor.role,
    }),
    40,
  ),
}));
const current = computed(() => {
  const t = phaseTime(props.time);
  return cursors[
    CLICKS[props.mode].some(
      (click) =>
        Math.abs(t - click.at) < 0.15 && !["duration"].includes(click.target),
    )
      ? 1
      : 0
  ]!;
});
const style = computed(() => {
  const pose = pointerAt(props.mode, props.time),
    { width, height, hotspot } = current.value.geometry;
  return {
    width: `${width}px`,
    height: `${height}px`,
    transformOrigin: `${hotspot.x}px ${hotspot.y}px`,
    transform: `translate3d(${pose.x - hotspot.x}px,${pose.y - hotspot.y}px,0) scale(${pose.scale})`,
  };
});
function ringStyle(click: (typeof CLICKS)["export"][number]) {
  const ring = rippleFor(props.time, click)?.rings[0];
  return {
    transform: `translate3d(${click.x - 16}px,${click.y - 16}px,0) scale(${(ring?.radius ?? 0) / 16})`,
    opacity: ring?.opacity ?? 0,
  };
}
</script>

<template>
  <span
    v-for="click in CLICKS[mode]"
    :key="click.at"
    class="click-ring"
    :style="ringStyle(click)"
    aria-hidden="true"
  />
  <div
    class="demo-cursor"
    :data-cursor-role="current.role"
    :style="style"
    aria-hidden="true"
    data-layout-allow-occlusion="true"
  >
    <img
      v-for="cursor in cursors"
      :key="cursor.role"
      v-show="current.role === cursor.role"
      :src="cursor.url"
      data-layout-allow-occlusion="true"
      alt=""
    />
  </div>
</template>
