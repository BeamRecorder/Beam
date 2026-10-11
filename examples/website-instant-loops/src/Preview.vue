<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { renderCompositionFrame, disposeCompositionRenderer } from '../../../packages/runtime/src/rendering/render';
import { presetPreviewSnapshot } from '../../../apps/desktop/src/components/hud/preset-preview';
import { capture } from './demo-capture';
import artworkUrl from '../assets/beautiful-captures.webp';
const props = defineProps<{ preset: string; time: number }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const frames = new Map<string, HTMLCanvasElement>();
let readyResolve: () => void;
const ready = new Promise<void>((resolve) => {
  readyResolve = resolve;
});
function paint() {
  const frame = frames.get(props.preset);
  if (!canvas.value || !frame) return;
  canvas.value.width = frame.width;
  canvas.value.height = frame.height;
  canvas.value.getContext('2d')!.drawImage(frame, 0, 0);
}
onMounted(async () => {
  const artwork = new Image();
  artwork.src = artworkUrl;
  await artwork.decode();
  const document = await capture.getEditorPresets();
  const source = { source: artwork, width: artwork.naturalWidth, height: artwork.naturalHeight };
  try {
    for (const preset of document.presets) {
      const snapshot = presetPreviewSnapshot(preset, 'video', preset.settings.editor.presentation?.background ?? null);
      const target = window.document.createElement('canvas');
      target.width = snapshot.canvas.width;
      target.height = snapshot.canvas.height;
      renderCompositionFrame(
        target.getContext('2d')!,
        source,
        snapshot,
        0.5,
        null,
        undefined,
        new Map([['preset-sample', source]]),
      );
      frames.set(preset.id, target);
    }
  } finally {
    disposeCompositionRenderer();
  }
  paint();
  readyResolve();
});
watch(() => [props.preset, props.time], paint, { flush: 'post' });
defineExpose({ ready, paint, thumbnail: () => canvas.value!.toDataURL('image/webp', 0.7) });
</script>
<template>
  <canvas
    ref="canvas"
    class="preview-canvas"
    aria-label="Beam frame rendered with the saved preset"
    :data-preset="preset"
  />
</template>
<style scoped>
.preview-canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--radius-md);
}
</style>
