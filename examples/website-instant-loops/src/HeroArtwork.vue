<script setup lang="ts">
import { computed } from 'vue';
import ScreenshotCanvas from '../../../apps/desktop/src/components/screenshot/ScreenshotCanvas.vue';
import { DEFAULT_OUTPUT_CANVAS, normalizeOutputCanvas } from '../../../packages/engine/src/layout/output-canvas';
import { createDefaultClipAppearance } from '../../../packages/engine/src/shared/composition-defaults';
import type { ScreenshotState } from '../../../packages/engine/src/screenshot/screenshot-types';
import artwork from '../assets/beautiful-captures.webp';
import { smooth } from './motion';
import { demoPresets } from './demo-capture';
import type { HeroState } from './hero-types';

const props = defineProps<{ time: number; selected?: boolean; preset: HeroState['preset'] }>();
const emit = defineEmits<{ ready: [] }>();
const state = computed<ScreenshotState>(() => {
  const drag = smooth((props.time - 0.7) / 0.9);
  const preset = demoPresets.find(preset => preset.id === props.preset)!;
  const screen = preset.settings.editor.visual!.screen!;
  return {
    canvas: normalizeOutputCanvas({ ...DEFAULT_OUTPUT_CANVAS, showBackground: true, width: 1280, height: 800, preset: 'custom', watermark: { ...normalizeOutputCanvas(undefined).watermark!, enabled: false } }),
    background: preset.settings.editor.presentation!.background!,
    blurPercent: 0, format: 'png', quality: 0.95, shapes: [],
    image: {
      id: 'instant-artwork', kind: 'image', name: 'Beautiful Captures', assetId: 'instant-artwork',
      enabled: true, order: 1, timelineStartMs: 0, timelineDurationMs: 1, sourceInMs: 0, sourceDurationMs: 1,
      playbackRate: 1, cameraFramingPreset: 'fit', isMirrored: false, isMirroredY: false,
      appearance: { ...createDefaultClipAppearance('image'), ...screen.appearance },
      transform: { ...screen.transform, x: screen.transform!.x + 26 / 640 * drag, y: screen.transform!.y + 16 / 400 * drag },
    },
  };
});
</script>
<template>
  <ScreenshotCanvas
    :source="artwork" :state="state" :selected-id="selected ? 'instant-artwork' : null"
    :selected-ids="selected ? ['instant-artwork'] : []" :zoom-disabled="true"
    @ready="emit('ready')" @error="(message) => { throw new Error(message); }"
  />
</template>
