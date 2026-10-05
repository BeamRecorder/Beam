<script setup lang="ts">
import { computed } from "vue";
import { MACOS_CURSOR_PACK } from "../../../apps/desktop/src/components/editor/properties/cursor/cursor-packs";
import {
  cursorGeometry,
  resolveCursorAsset,
} from "../../../packages/engine/src/shared/cursor-assets";
import arrow from "../.media/images/icon_001.svg";
import resize from "../.media/images/icon_002.svg";
import { cursorRoleForPose } from "./cursor-role";
import type { DemoPose } from "./demo-types";

const props = defineProps<{ pose: DemoPose }>();
const cursors = [
  { role: "default", source: arrow },
  { role: "resizewesteast", source: resize },
].map((cursor) => ({
  ...cursor,
  geometry: cursorGeometry(
    resolveCursorAsset(MACOS_CURSOR_PACK, {
      packId: MACOS_CURSOR_PACK.id,
      mode: "fixed",
      cursorId: cursor.role,
    }),
    54,
  ),
}));
const role = computed(() => cursorRoleForPose(props.pose));
const current = computed(() =>
  cursors.find((cursor) => cursor.role === role.value)!,
);
const style = computed(() => {
  const { width, height, hotspot } = current.value.geometry;
  return {
    width: `${width}px`,
    height: `${height}px`,
    transformOrigin: `${hotspot.x}px ${hotspot.y}px`,
    transform: `translate3d(${props.pose.cursorX - hotspot.x}px,${props.pose.cursorY - hotspot.y}px,0) scale(${props.pose.cursorScale})`,
  };
});
</script>

<template>
  <div
    class="demo-cursor"
    :style="style"
    :data-cursor-role="role"
    aria-hidden="true"
    data-layout-allow-occlusion="true"
  >
    <!-- Decode both sprites before playback; switching roles never replaces src. -->
    <img
      v-for="cursor in cursors"
      :key="cursor.role"
      v-show="cursor.role === role"
      :src="cursor.source"
      alt=""
    />
  </div>
</template>

<style scoped>
.demo-cursor {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 50;
  filter: drop-shadow(0 2px 2px #00000055);
  pointer-events: none;
}
img {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
