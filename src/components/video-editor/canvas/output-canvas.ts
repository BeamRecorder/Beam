import type {
  OutputCanvasPreset,
  OutputCanvasSettings,
  WatermarkPosition,
  WatermarkSettings,
} from './output-canvas-types';
import {
  EMPTY_CLIP_TRANSITIONS,
  MAX_TRANSITION_DURATION_MS,
  normalizeCanvasTransitions,
} from '~/media/shared/clip-transitions';

export type {
  OutputCanvasPreset,
  OutputCanvasSettings,
  WatermarkPosition,
  WatermarkSettings,
} from './output-canvas-types';

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  text: 'made-with-beam',
  showLogo: true,
  localized: false,
  position: 'bottom-right',
  size: 100,
  shadow: 20,
  backgroundColor: '#111114',
  backgroundOpacity: 78,
  backgroundRadius: 100,
  backgroundPadding: 100,
};

export const normalizeWatermark = (value: Partial<WatermarkSettings> | null | undefined): WatermarkSettings => ({
  enabled: value?.enabled === true,
  text: value?.text === 'none' || value?.text === 'beam' ? value.text : 'made-with-beam',
  showLogo: value?.showLogo !== false,
  localized: value?.localized === true,
  renderedText: typeof value?.renderedText === 'string' ? value.renderedText.slice(0, 80) : undefined,
  position: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value?.position ?? '')
    ? (value!.position as WatermarkPosition)
    : 'bottom-right',
  size: Number.isFinite(value?.size) ? Math.max(50, Math.min(200, Math.round(value!.size!))) : 100,
  shadow: Number.isFinite(value?.shadow) ? Math.max(0, Math.min(100, Math.round(value!.shadow!))) : 20,
  backgroundColor:
    typeof value?.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.backgroundColor)
      ? value.backgroundColor
      : '#111114',
  backgroundOpacity: Number.isFinite(value?.backgroundOpacity)
    ? Math.max(0, Math.min(100, Math.round(value!.backgroundOpacity!)))
    : 78,
  backgroundRadius: Number.isFinite(value?.backgroundRadius)
    ? Math.max(0, Math.min(100, Math.round(value!.backgroundRadius!)))
    : 100,
  backgroundPadding: Number.isFinite(value?.backgroundPadding)
    ? Math.max(50, Math.min(150, Math.round(value!.backgroundPadding!)))
    : 100,
});

export const OUTPUT_PREVIEW_RADIUS = 16;
export const OUTPUT_FALLBACK_COLOR = '#1e1e24';

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
  transitions: { ...EMPTY_CLIP_TRANSITIONS },
  watermark: { ...DEFAULT_WATERMARK },
};

export const OUTPUT_CANVAS_PRESETS: Record<Exclude<OutputCanvasPreset, 'custom'>, OutputCanvasSettings> = {
  '16:9': {
    preset: '16:9',
    width: 1920,
    height: 1080,
    showBackground: false,
    transitions: { ...EMPTY_CLIP_TRANSITIONS },
  },
  '9:16': {
    preset: '9:16',
    width: 1080,
    height: 1920,
    showBackground: false,
    transitions: { ...EMPTY_CLIP_TRANSITIONS },
  },
  '1:1': {
    preset: '1:1',
    width: 1080,
    height: 1080,
    showBackground: false,
    transitions: { ...EMPTY_CLIP_TRANSITIONS },
  },
  '4:5': {
    preset: '4:5',
    width: 1080,
    height: 1350,
    showBackground: false,
    transitions: { ...EMPTY_CLIP_TRANSITIONS },
  },
  '3:4': {
    preset: '3:4',
    width: 1080,
    height: 1440,
    showBackground: false,
    transitions: { ...EMPTY_CLIP_TRANSITIONS },
  },
  '4:3': {
    preset: '4:3',
    width: 1440,
    height: 1080,
    showBackground: false,
    transitions: { ...EMPTY_CLIP_TRANSITIONS },
  },
  '21:9': {
    preset: '21:9',
    width: 2520,
    height: 1080,
    showBackground: false,
    transitions: { ...EMPTY_CLIP_TRANSITIONS },
  },
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
  const watermark = normalizeWatermark(value?.watermark);
  const transitions = normalizeCanvasTransitions(
    value?.transitions ?? EMPTY_CLIP_TRANSITIONS,
    MAX_TRANSITION_DURATION_MS * 2,
  );
  if (preset !== 'custom') return { ...OUTPUT_CANVAS_PRESETS[preset], showBackground, transitions, watermark };
  return { preset, width: Math.max(1, width), height: Math.max(1, height), showBackground, transitions, watermark };
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
