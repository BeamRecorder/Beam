<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Maximize,
  Search,
  Settings2,
  PanelsTopLeft,
} from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import EditorTitlebar from "../../../apps/desktop/src/components/editor/EditorTitlebar.vue";
import TimelineAddMenu from "../../../apps/desktop/src/components/editor/timeline/TimelineAddMenu.vue";
import { MACOS_CURSOR_PACK } from "../../../apps/desktop/src/components/editor/properties/cursor/cursor-packs";
import {
  cursorGeometry,
  resolveCursorAsset,
} from "../../../packages/engine/src/shared/cursor-assets";
import Inspector from "./Inspector.vue";
import Timeline from "./Timeline.vue";
import Preview from "./Preview.vue";
import { cameraAt, opacityAt, pointerAt } from "./motion";
import type {
  DemoTheme,
  Pose,
  SceneHandle,
  TimelineHandle,
} from "./demo-types";
import wallpaperLight from "../assets/tahoe-light.webp";
import wallpaperDark from "../assets/tahoe-dark.webp";
import arrow from "../assets/macos-arrow.svg";
import resize from "../assets/macos-resize-horizontal.svg";
import beamIcon from "../assets/beam.webp";
const props = defineProps<{ theme: DemoTheme; pose: Pose }>();
const preview = ref<SceneHandle | null>(null),
  tracks = ref<TimelineHandle | null>(null);
const pointerCanvas = ref<HTMLCanvasElement | null>(null);
const cursor = computed(() => pointerAt(props.pose.time));
const camera = computed(() => cameraAt(props.pose.time));
const cursors = [
  { role: "default", src: arrow },
  { role: "resizewesteast", src: resize },
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
const current = computed(
  () => cursors.find((sprite) => sprite.role === cursor.value.role)!,
);
const sprites = new Map<string, HTMLImageElement>();
const spriteReady = Promise.all(
  cursors.map(async (sprite) => {
    const image = new Image();
    image.src = sprite.src;
    await image.decode();
    sprites.set(sprite.role, image);
  }),
);
const pointerStyle = computed(() => {
  const { width, height, hotspot } = current.value.geometry;
  return {
    width: `${width}px`,
    height: `${height}px`,
    transformOrigin: `${hotspot.x}px ${hotspot.y}px`,
    transform: `translate3d(${cursor.value.x - hotspot.x}px,${cursor.value.y - hotspot.y}px,0) scale(${cursor.value.scale})`,
  };
});
function paintPointer() {
  const ctx = pointerCanvas.value!.getContext("2d")!;
  ctx.clearRect(0, 0, 108, 108);
  ctx.drawImage(sprites.get(cursor.value.role)!, 0, 0, 108, 108);
}
const ready = (async () => {
  await nextTick();
  await Promise.all([spriteReady, preview.value!.ready, tracks.value!.ready]);
  paintPointer();
})();
async function paint() {
  tracks.value!.paint();
  paintPointer();
  await preview.value!.paint();
}
defineExpose({ ready, paint });
</script>
<template>
  <div class="design-stage">
    <img
      :src="theme === 'dark' ? wallpaperDark : wallpaperLight"
      class="wallpaper"
      alt=""
    />
    <div
      class="world"
      :style="{
        opacity: opacityAt(pose.time),
        transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`,
      }"
    >
      <div class="editor-card" data-layout-allow-overflow="true">
        <EditorTitlebar>
          <template #left>
            <Button
              :icon="ArrowLeft"
              size="xs"
              variant="ghost"
              icon-only
              aria-label="Back"
            />
            <span class="beam-brand"><img :src="beamIcon" alt="" />Beam</span>
            <Button size="xs" variant="secondary"
              >Default <ChevronDown :size="12"
            /></Button>
            <Button
              :icon="Search"
              size="xs"
              variant="ghost"
              icon-only
              aria-label="Search"
            />
            <Button
              :icon="Settings2"
              size="xs"
              variant="ghost"
              icon-only
              aria-label="Settings"
            />
          </template>
          <template #center
            ><span class="project-name"
              >Quiet Aurora 4 <ChevronDown :size="12" /></span
          ></template>
          <template #right
            ><span class="dimensions">1920 × 1080</span>
            <Button
              :icon="Maximize"
              size="xs"
              variant="ghost"
              icon-only
              aria-label="Fullscreen"
            />
            <Button :icon="Download" size="xs" variant="primary">Export</Button>
          </template>
        </EditorTitlebar>
        <main class="workspace">
          <Inspector :pose="pose" />
          <div class="canvas-tools">
            <Button
              :icon="PanelsTopLeft"
              size="xs"
              variant="ghost"
              class="canvas-button"
              >Canvas</Button
            >
            <div class="add-menu"><TimelineAddMenu /></div>
          </div>
          <div class="preview-area"><Preview ref="preview" :pose="pose" /></div>
          <span class="preview-scale">Fit · 1920 × 1080</span>
        </main>
        <Timeline ref="tracks" :pose="pose" />
      </div>
      <div
        class="demo-cursor"
        :style="pointerStyle"
        :data-role="cursor.role"
        aria-hidden="true"
        data-layout-allow-occlusion="true"
      >
        <canvas ref="pointerCanvas" width="108" height="108" />
      </div>
    </div>
  </div>
</template>
