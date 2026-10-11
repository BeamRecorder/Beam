<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import {
  renderCompositionFrame,
  disposeCompositionRenderer,
} from "../../../packages/runtime/src/rendering/render";
import { createSnapshotCameraEvaluator } from "../../../packages/runtime/src/rendering/snapshot-camera";
import { createCursorMotionPlayer } from "../../../packages/engine/src/cursor/cursor-motion";
import { sourceTimeAt } from "../../../packages/engine/src/shared/timeline-mapping";
import type { RenderableMedia } from "../../../packages/runtime/src/rendering/render-types";
import type { Pose } from "./demo-types";
import { snapshotAt, stateAt } from "./scene-model";
import { decodeVideo } from "./video";
import screenUrl from "../assets/screen-recording.mp4";
import webcamUrl from "../assets/demo-webcam.mp4";
import backgroundUrl from "../assets/ventura.webp";
const props = defineProps<{ pose: Pose }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const backdrop = new Image();
backdrop.src = backgroundUrl;
const cursorUrls = import.meta.glob("../assets/recorded-cursors/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const cursors = new Map<string, HTMLImageElement>();
const initial = snapshotAt(0);
const cursorMotion = createCursorMotionPlayer(
  initial.cursor.events,
  initial.cursorSettings.motion,
  3072,
  1862,
);
const media = Promise.all([decodeVideo(screenUrl), decodeVideo(webcamUrl)]);
let finalCamera: ReturnType<typeof createSnapshotCameraEvaluator> | null = null;
async function paint() {
  const [screen, camera] = await media,
    state = stateAt(props.pose.time),
    snapshot = snapshotAt(props.pose.time);
  const visuals = new Map<string, RenderableMedia>();
  let primary: RenderableMedia | null = null;
  for (const clip of state.composition.clips) {
    if (clip.kind !== "screen" && clip.kind !== "webcam") continue;
    const sourceMs = sourceTimeAt(clip, state.previewTime * 1000);
    if (sourceMs === null) continue;
    const decoder = clip.kind === "screen" ? screen : camera;
    const frame = {
      source: await decoder.frame(sourceMs / 1000),
      width: decoder.width,
      height: decoder.height,
    };
    visuals.set(clip.id, frame);
    if (clip.kind === "screen") primary = frame;
  }
  if (!primary)
    throw new Error("The authored playhead must lie on a recording.");
  if (snapshot.zooms.length && !finalCamera)
    finalCamera = createSnapshotCameraEvaluator(
      snapshot,
      screen.width,
      screen.height,
    );
  const evaluator = snapshot.zooms.length
    ? finalCamera!
    : createSnapshotCameraEvaluator(snapshot, screen.width, screen.height);
  renderCompositionFrame(
    canvas.value!.getContext("2d")!,
    primary,
    snapshot,
    state.previewTime,
    snapshot.background?.kind === "image"
      ? {
          source: backdrop,
          width: backdrop.naturalWidth,
          height: backdrop.naturalHeight,
        }
      : null,
    cursors,
    visuals,
    cursorMotion,
    evaluator,
  );
}
const ready = (async () => {
  await nextTick();
  await backdrop.decode();
  await media;
  await Promise.all(
    initial.cursorPack!.cursors.map(async (cursor) => {
      const name = cursor.url.split("/").at(-1)!;
      const image = new Image();
      image.src = cursorUrls[`../assets/recorded-cursors/${name}`]!;
      await image.decode();
      cursors.set(cursor.id, image);
    }),
  );
  await document.fonts.ready;
  await paint();
})();
onBeforeUnmount(() => {
  void media.then((decoders) =>
    decoders.forEach((decoder) => decoder.dispose()),
  );
  disposeCompositionRenderer();
});
defineExpose({ ready, paint });
</script>
<template>
  <div class="preview-surface">
    <canvas ref="canvas" width="1280" height="720" />
  </div>
</template>
<style scoped>
.preview-surface {
  position: relative;
  width: 810px;
  height: 455.625px;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
}
</style>
