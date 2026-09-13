import { OUTPUT_CANVAS_PRESETS, type OutputCanvasSettings } from '../canvas/output-canvas';
import type { ScreenshotDimensions } from './screenshot-types';

export function validScreenshotDimensions({ width, height }: ScreenshotDimensions): boolean {
  return (
    [width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 16384) &&
    width * height <= 67_108_864
  );
}

export function resizeScreenshotCanvas(
  canvas: OutputCanvasSettings,
  side: 'width' | 'height',
  value: string | number,
  keepAspect: boolean,
): OutputCanvasSettings {
  const size = Number(value);
  const other = side === 'width' ? 'height' : 'width';
  const next = { ...canvas, preset: 'custom' as const, [side]: size };
  if (keepAspect) next[other] = Math.round((size * canvas[other]) / canvas[side]);
  return validScreenshotDimensions(next) ? next : canvas;
}

export function screenshotCanvasPreset(canvas: OutputCanvasSettings, preset: string, original: ScreenshotDimensions) {
  const dimensions =
    preset === 'original' ? original : Object.values(OUTPUT_CANVAS_PRESETS).find((item) => item.preset === preset);
  if (!dimensions || !validScreenshotDimensions(dimensions)) return canvas;
  return { ...canvas, preset: 'custom' as const, width: dimensions.width, height: dimensions.height };
}
