import type { CameraFramingPreset, CameraLayoutPreset } from '~/media/shared/camera-layout-types';
import type { NormalizedCrop, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import { containedMediaRect, coverSourceRect, framedMediaRect, type CanvasRect } from '../canvas/output-canvas';
import { isPhoneFrame } from './appearance/phone-frames';

const FLOATING_MARGIN = 0.04;
const FLOATING_SIZE = 0.28;

const FULL_CANVAS: NormalizedTransform = { x: 0, y: 0, width: 1, height: 1 };
const insetSplit = (transform: NormalizedTransform, padding: number): NormalizedTransform => ({
  x: transform.x + padding,
  y: transform.y + padding,
  width: transform.width - padding * 2,
  height: transform.height - padding * 2,
});

export function cameraLayoutTransform(
  preset: CameraLayoutPreset,
  splitRatio = 0.5,
  splitPadding = 0,
): NormalizedTransform {
  switch (preset) {
    case 'floating-top-left':
      return { x: FLOATING_MARGIN, y: FLOATING_MARGIN, width: FLOATING_SIZE, height: FLOATING_SIZE };
    case 'floating-top-right':
      return {
        x: 1 - FLOATING_MARGIN - FLOATING_SIZE,
        y: FLOATING_MARGIN,
        width: FLOATING_SIZE,
        height: FLOATING_SIZE,
      };
    case 'floating-bottom-left':
      return {
        x: FLOATING_MARGIN,
        y: 1 - FLOATING_MARGIN - FLOATING_SIZE,
        width: FLOATING_SIZE,
        height: FLOATING_SIZE,
      };
    case 'floating-bottom-right':
      return {
        x: 1 - FLOATING_MARGIN - FLOATING_SIZE,
        y: 1 - FLOATING_MARGIN - FLOATING_SIZE,
        width: FLOATING_SIZE,
        height: FLOATING_SIZE,
      };
    case 'floating-center':
      return { x: 0.18, y: 0.18, width: 0.64, height: 0.64 };
    case 'split-left':
      return insetSplit({ x: 0, y: 0, width: splitRatio, height: 1 }, splitPadding);
    case 'split-right':
      return insetSplit({ x: 1 - splitRatio, y: 0, width: splitRatio, height: 1 }, splitPadding);
    case 'split-top':
      return insetSplit({ x: 0, y: 0, width: 1, height: splitRatio }, splitPadding);
    case 'split-bottom':
      return insetSplit({ x: 0, y: 1 - splitRatio, width: 1, height: splitRatio }, splitPadding);
    case 'fullscreen':
    case 'custom':
      return { ...FULL_CANVAS };
  }
}

export function linkedScreenTransform(
  preset: CameraLayoutPreset,
  splitRatio = 0.5,
  splitPadding = 0,
): NormalizedTransform {
  switch (preset) {
    case 'split-left':
      return insetSplit({ x: splitRatio, y: 0, width: 1 - splitRatio, height: 1 }, splitPadding);
    case 'split-right':
      return insetSplit({ x: 0, y: 0, width: 1 - splitRatio, height: 1 }, splitPadding);
    case 'split-top':
      return insetSplit({ x: 0, y: splitRatio, width: 1, height: 1 - splitRatio }, splitPadding);
    case 'split-bottom':
      return insetSplit({ x: 0, y: 0, width: 1, height: 1 - splitRatio }, splitPadding);
    default:
      return { ...FULL_CANVAS };
  }
}

export interface CameraFramingGeometry {
  rect: CanvasRect;
  sourceRect?: CanvasRect;
  mask?: 'circle' | 'squircle';
  circular: boolean;
}

const centeredAspectRect = (bounds: CanvasRect, aspect: number): CanvasRect => {
  const width = Math.min(bounds.width, bounds.height * aspect);
  const height = width / aspect;
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
};

const cropRect = (crop: NormalizedCrop | undefined, width: number, height: number): CanvasRect | undefined =>
  crop ? { x: crop.x * width, y: crop.y * height, width: crop.width * width, height: crop.height * height } : undefined;

export function resolveCameraFraming(
  preset: CameraFramingPreset,
  bounds: CanvasRect,
  sourceWidth: number,
  sourceHeight: number,
  manualCrop?: NormalizedCrop,
  mirrored = false,
  mirroredY = false,
): CameraFramingGeometry {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  if (preset === 'custom') {
    const rect = manualCrop
      ? {
          x: bounds.x + (mirrored ? 1 - manualCrop.x - manualCrop.width : manualCrop.x) * bounds.width,
          y: bounds.y + (mirroredY ? 1 - manualCrop.y - manualCrop.height : manualCrop.y) * bounds.height,
          width: bounds.width * manualCrop.width,
          height: bounds.height * manualCrop.height,
        }
      : bounds;
    return { rect, sourceRect: cropRect(manualCrop, safeWidth, safeHeight), circular: false };
  }
  if (preset === 'fit') {
    const fit = containedMediaRect(safeWidth, safeHeight, bounds.width, bounds.height);
    return {
      rect: { x: bounds.x + fit.x, y: bounds.y + fit.y, width: fit.width, height: fit.height },
      circular: false,
    };
  }
  const aspect =
    preset === 'portrait'
      ? 9 / 16
      : preset === 'landscape'
        ? 16 / 9
        : preset === 'square' || preset === 'squircle' || preset === 'circle'
          ? 1
          : bounds.width / Math.max(1, bounds.height);
  const rect = preset === 'fill' ? bounds : centeredAspectRect(bounds, aspect);
  return {
    rect,
    sourceRect: coverSourceRect(safeWidth, safeHeight, rect.width, rect.height),
    ...(preset === 'circle' ? { mask: 'circle' as const } : preset === 'squircle' ? { mask: 'squircle' as const } : {}),
    circular: preset === 'circle',
  };
}

export interface ScreenRenderGeometry {
  source: CanvasRect;
  media: CanvasRect;
  positioned: CanvasRect;
  mask?: 'circle' | 'squircle';
}

export function resolveScreenRenderGeometry(
  clip: VisualClip,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  showBackground: boolean,
  transform = clip.transform,
  crop = clip.crop,
  framingPreset = clip.cameraFramingPreset ?? 'custom',
): ScreenRenderGeometry {
  const media = showBackground
    ? framedMediaRect(sourceWidth, sourceHeight, canvasWidth, canvasHeight)
    : { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  const layout = {
    x: media.x + transform.x * media.width,
    y: media.y + transform.y * media.height,
    width: media.width * transform.width,
    height: media.height * transform.height,
  };
  if (framingPreset === 'custom') {
    const framing = resolveCameraFraming(
      'custom',
      layout,
      sourceWidth,
      sourceHeight,
      crop,
      clip.isMirrored,
      clip.isMirroredY,
    );
    return {
      source: framing.sourceRect ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
      media,
      positioned: clip.appearance && isPhoneFrame(clip.appearance.frame) ? layout : framing.rect,
    };
  }
  const cropX = crop ? crop.x * sourceWidth : 0;
  const cropY = crop ? crop.y * sourceHeight : 0;
  const cropWidth = crop ? crop.width * sourceWidth : sourceWidth;
  const cropHeight = crop ? crop.height * sourceHeight : sourceHeight;
  const source = showBackground
    ? { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
    : coverSourceRect(cropWidth, cropHeight, canvasWidth, canvasHeight);
  if (!showBackground) {
    source.x += cropX;
    source.y += cropY;
  }
  const flexibleSquircle = framingPreset === 'squircle' && clip.kind !== 'webcam';
  const framing = resolveCameraFraming(flexibleSquircle ? 'fill' : framingPreset, layout, source.width, source.height);
  const framedSource = framing.sourceRect
    ? {
        x: source.x + framing.sourceRect.x,
        y: source.y + framing.sourceRect.y,
        width: framing.sourceRect.width,
        height: framing.sourceRect.height,
      }
    : source;
  return {
    source: framedSource,
    media,
    positioned: framing.rect,
    mask: flexibleSquircle ? 'squircle' : framing.mask,
  };
}

export function mapSourcePointToScreen(
  point: { cx: number; cy: number },
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  geometry: ScreenRenderGeometry,
) {
  return {
    cx:
      (geometry.positioned.x +
        ((point.cx * sourceWidth - geometry.source.x) / Math.max(1, geometry.source.width)) *
          geometry.positioned.width) /
      canvasWidth,
    cy:
      (geometry.positioned.y +
        ((point.cy * sourceHeight - geometry.source.y) / Math.max(1, geometry.source.height)) *
          geometry.positioned.height) /
      canvasHeight,
  };
}
