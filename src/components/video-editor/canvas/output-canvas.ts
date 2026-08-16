export type OutputCanvasPreset = '16:9' | '9:16' | '1:1' | '4:5' | '3:4' | '4:3' | '21:9' | 'custom';
export interface OutputCanvasSettings {
  preset: OutputCanvasPreset;
  width: number;
  height: number;
  showBackground: boolean;
}

export const OUTPUT_PREVIEW_RADIUS = 16;

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_OUTPUT_CANVAS: OutputCanvasSettings = {
  preset: '16:9',
  width: 1920,
  height: 1080,
  showBackground: false,
};

export const OUTPUT_CANVAS_PRESETS: Record<Exclude<OutputCanvasPreset, 'custom'>, OutputCanvasSettings> = {
  '16:9': { preset: '16:9', width: 1920, height: 1080, showBackground: false },
  '9:16': { preset: '9:16', width: 1080, height: 1920, showBackground: false },
  '1:1': { preset: '1:1', width: 1080, height: 1080, showBackground: false },
  '4:5': { preset: '4:5', width: 1080, height: 1350, showBackground: false },
  '3:4': { preset: '3:4', width: 1080, height: 1440, showBackground: false },
  '4:3': { preset: '4:3', width: 1440, height: 1080, showBackground: false },
  '21:9': { preset: '21:9', width: 2520, height: 1080, showBackground: false },
};

export function normalizeOutputCanvas(
  value: (Partial<OutputCanvasSettings> & { fit?: 'cover' | 'contain' }) | null | undefined,
): OutputCanvasSettings {
  const width = Number.isFinite(value?.width) ? Math.round(value!.width!) : DEFAULT_OUTPUT_CANVAS.width;
  const height = Number.isFinite(value?.height) ? Math.round(value!.height!) : DEFAULT_OUTPUT_CANVAS.height;
  const preset =
    value?.preset && ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '21:9', 'custom'].includes(value.preset)
      ? value.preset
      : DEFAULT_OUTPUT_CANVAS.preset;
  const showBackground =
    typeof value?.showBackground === 'boolean' ? value.showBackground : value?.fit === 'cover' ? false : true;
  if (preset !== 'custom') return { ...OUTPUT_CANVAS_PRESETS[preset], showBackground };
  return { preset, width: Math.max(1, width), height: Math.max(1, height), showBackground };
}

export function outputPreviewRect(
  availableWidth: number,
  availableHeight: number,
  output: OutputCanvasSettings,
): CanvasRect {
  const width = Math.max(1, availableWidth);
  const height = Math.max(1, availableHeight);
  const ratio = output.width / output.height;
  const previewWidth = Math.min(width, height * ratio);
  const previewHeight = previewWidth / ratio;
  return { x: (width - previewWidth) / 2, y: (height - previewHeight) / 2, width: previewWidth, height: previewHeight };
}

export function coverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): CanvasRect {
  const sourceRatio = Math.max(1, sourceWidth) / Math.max(1, sourceHeight);
  const destinationRatio = Math.max(1, destinationWidth) / Math.max(1, destinationHeight);
  if (sourceRatio > destinationRatio) {
    const width = sourceHeight * destinationRatio;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / destinationRatio;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

export function containedMediaRect(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): CanvasRect {
  const scale = Math.min(destinationWidth / Math.max(1, sourceWidth), destinationHeight / Math.max(1, sourceHeight));
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (destinationWidth - width) / 2, y: (destinationHeight - height) / 2, width, height };
}

export function framedMediaRect(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): CanvasRect {
  const frame = containedMediaRect(sourceWidth, sourceHeight, destinationWidth, destinationHeight);
  const scale = Math.min(0.86, destinationWidth / frame.width, destinationHeight / frame.height);
  const width = frame.width * scale;
  const height = frame.height * scale;
  return { x: (destinationWidth - width) / 2, y: (destinationHeight - height) / 2, width, height };
}

export function coverPoint(
  cx: number,
  cy: number,
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
) {
  const source = coverSourceRect(sourceWidth, sourceHeight, destinationWidth, destinationHeight);
  return { cx: (cx * sourceWidth - source.x) / source.width, cy: (cy * sourceHeight - source.y) / source.height };
}

export function outputPoint(
  cx: number,
  cy: number,
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
  showBackground: boolean,
) {
  if (!showBackground) return coverPoint(cx, cy, sourceWidth, sourceHeight, destinationWidth, destinationHeight);
  const media = framedMediaRect(sourceWidth, sourceHeight, destinationWidth, destinationHeight);
  return { cx: (media.x + cx * media.width) / destinationWidth, cy: (media.y + cy * media.height) / destinationHeight };
}
