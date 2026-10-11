import type { ScreenshotPresetPresentation, ScreenshotState } from './screenshot-types';
import { restoreScreenshotLayer, SCREENSHOT_BACKGROUND_ID, SCREENSHOT_WATERMARK_ID } from './screenshot-layers';

/** Presets change presentation; authored layers, names, visibility and compositing remain document-owned. */
export function applyScreenshotPreset(state: ScreenshotState, preset: ScreenshotPresetPresentation): ScreenshotState {
  const next: ScreenshotState = {
    ...state,
    canvas: preset.canvas,
    background: preset.background,
    blurPercent: preset.blurPercent,
    format: preset.format,
    quality: preset.quality,
    image: {
      ...state.image,
      transform: preset.image.transform,
      appearance: preset.image.appearance,
      isMirrored: preset.image.isMirrored,
      isMirroredY: preset.image.isMirroredY,
      cameraFramingPreset: preset.image.cameraFramingPreset,
    },
    composition: state.composition?.map((layer) => ({ ...layer })),
  };
  if (next.canvas.showBackground) restoreScreenshotLayer(next, SCREENSHOT_BACKGROUND_ID);
  if (next.canvas.watermark?.enabled) restoreScreenshotLayer(next, SCREENSHOT_WATERMARK_ID);
  return next;
}
