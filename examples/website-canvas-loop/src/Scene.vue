<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { Clapperboard, Maximize, Minus, Plus } from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import StaticGradient from "../../website-editing-loop/src/StaticGradient.vue";
import LibraryPanel from "./LibraryPanel.vue";
import { IMAGES, POINTER_GEOMETRY, pointer, VIDEO } from "./catalog";
import { STEPS, clickAt, rippleAt, stateAt } from "./motion";
import { paintPreview } from "./preview";
import { createVideoBackground } from "./video";
import type { CanvasPose } from "./demo-types";
import artworkUrl from "../assets/beautiful-captures.webp";

const props = defineProps<{ pose: CanvasPose }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const images = new Map<string, HTMLImageElement>();
let artwork: HTMLImageElement;
let provider: Awaited<ReturnType<typeof createVideoBackground>> | undefined;
let revision = 0;
const dark = document.documentElement.dataset.demoTheme === "dark";
async function image(url: string) {
  const value = new Image();
  value.src = url;
  await value.decode();
  return value;
}
async function paint() {
  if (!provider || !artwork || !canvas.value) return;
  const generation = ++revision;
  const time = props.pose.time;
  const state = stateAt(time);
  let video: CanvasImageSource = images.get("wispysky")!;
  if (
    state.current.kind === "video" ||
    (state.previous.kind === "video" && state.transition < 1)
  )
    video = await provider.frame(Math.max(0, time - 2.7) * 1.8);
  if (generation !== revision) return;
  const context = canvas.value.getContext("2d");
  if (!context) throw new Error("Canvas preview is unavailable.");
  paintPreview(context, time, images, artwork, video, dark);
}
const ready = (async () => {
  await nextTick();
  await Promise.all(
    IMAGES.map(async (item) => images.set(item.id, await image(item.url))),
  );
  images.set(VIDEO.id, await image(VIDEO.poster));
  artwork = await image(artworkUrl);
  provider = await createVideoBackground();
  await paint();
})();
const camera = computed(() => ({
  transform: `scale(${1 + props.pose.camera * 0.028})`,
}));
const pointerStyle = computed(() => ({
  width: `${POINTER_GEOMETRY.width}px`,
  height: `${POINTER_GEOMETRY.height}px`,
  transformOrigin: `${POINTER_GEOMETRY.hotspot.x}px ${POINTER_GEOMETRY.hotspot.y}px`,
  transform: `translate3d(${props.pose.x - POINTER_GEOMETRY.hotspot.x}px,${props.pose.y - POINTER_GEOMETRY.hotspot.y}px,0) scale(${clickAt(props.pose.time).scale})`,
}));
function ringStyle(step: (typeof STEPS)[number], index: number) {
  const ring = rippleAt(props.pose.time, step)?.rings[index];
  return {
    transform: `translate3d(${step.x - 16}px,${step.y - 16}px,0) scale(${(ring?.radius ?? 0) / 16})`,
    opacity: ring?.opacity ?? 0,
  };
}
onBeforeUnmount(() => {
  revision++;
  provider?.dispose();
});
defineExpose({ ready, paint });
</script>

<template>
  <div class="design-stage">
    <StaticGradient preset-id="bloom" />
    <div class="world" :style="camera">
      <div class="editor-card">
        <header class="project-bar">
          <Clapperboard :size="13" /><span>Beautiful Captures</span
          ><span class="project-format">Canvas</span>
        </header>
        <main class="workspace">
          <section class="preview-area" aria-label="Styled composition">
            <canvas
              ref="canvas"
              class="composition-preview"
              width="640"
              height="400"
            />
            <div class="preview-tools">
              <span>1920 × 1200</span>
              <div class="zoom-tools">
                <Button
                  :icon="Minus"
                  variant="ghost"
                  size="xs"
                  icon-only
                  aria-label="Zoom out"
                /><span>100%</span
                ><Button
                  :icon="Plus"
                  variant="ghost"
                  size="xs"
                  icon-only
                  aria-label="Zoom in"
                /><Button
                  :icon="Maximize"
                  variant="ghost"
                  size="xs"
                  icon-only
                  aria-label="Fit canvas"
                />
              </div>
            </div>
          </section>
          <LibraryPanel :pose="pose" />
        </main>
      </div>
      <template v-for="step in STEPS" :key="step.id">
        <span
          v-for="index in 2"
          :key="index"
          class="click-ring"
          :style="ringStyle(step, index - 1)"
          aria-hidden="true"
        />
      </template>
      <div
        class="demo-cursor"
        :style="pointerStyle"
        aria-hidden="true"
        data-layout-allow-occlusion="true"
      >
        <img :src="pointer" alt="" />
      </div>
    </div>
  </div>
</template>
