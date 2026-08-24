import type { CameraFramingPreset } from '~/media/shared/camera-layout-types';
import type { ClipComposition, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import type { CanvasRect } from '../canvas/output-canvas';
import { resolveCameraFraming } from './camera-layout';
import { frameContentRect, frameOuterRect } from './appearance/frames';
import { isPhoneFrame } from './appearance/phone-frames';

export function resolveVisualClipFraming(
  clip: VisualClip,
  bounds: CanvasRect,
  sourceWidth: number,
  sourceHeight: number,
  crop = clip.crop,
  preset: CameraFramingPreset = clip.cameraFramingPreset ?? 'custom',
) {
  if (preset === 'squircle' && clip.kind !== 'webcam') {
    return {
      ...resolveCameraFraming('fill', bounds, sourceWidth, sourceHeight, crop),
      mask: 'squircle' as const,
    };
  }
  return resolveCameraFraming(preset, bounds, sourceWidth, sourceHeight, crop);
}

export function visualClipDisplayLayout(
  clip: VisualClip,
  transform: NormalizedTransform,
  viewport: { x: number; y: number; width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  preset: CameraFramingPreset,
  frameRegion: 'outer' | 'content' | 'none' = 'outer',
) {
  const framing = resolveVisualClipFraming(
    clip,
    {
      x: viewport.x + transform.x * viewport.width,
      y: viewport.y + transform.y * viewport.height,
      width: transform.width * viewport.width,
      height: transform.height * viewport.height,
    },
    sourceWidth,
    sourceHeight,
    clip.crop,
    preset,
  );
  const rect =
    frameRegion === 'outer'
      ? frameOuterRect(framing.rect, clip.appearance.frame)
      : frameRegion === 'content'
        ? frameContentRect(framing.rect, clip.appearance.frame, {
            showMenu: clip.appearance.frameShowMenu,
            showScrollbars: clip.appearance.frameShowScrollbars,
            chromeScale: clip.appearance.frameChromeScale,
          })
        : framing.rect;
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

export function editableVisualClipTransform(
  composition: ClipComposition,
  clip: VisualClip,
  transform: NormalizedTransform,
  bounds: { dx: number; dy: number; dw: number; dh: number },
) {
  const preset = clip.cameraFramingPreset ?? 'custom';
  if (isPhoneFrame(clip.appearance.frame)) return transform;
  if (preset === 'custom' || preset === 'fill' || preset === 'squircle') return transform;
  const asset = composition.assets.find((entry) => entry.id === clip.assetId);
  const viewport = {
    x: bounds.dx,
    y: bounds.dy,
    width: bounds.dw,
    height: bounds.dh,
  };
  const visible = visualClipDisplayLayout(
    clip,
    transform,
    viewport,
    asset?.width ?? bounds.dw,
    asset?.height ?? bounds.dh,
    preset,
  );
  return {
    x: (visible.left - viewport.x) / Math.max(1, viewport.width),
    y: (visible.top - viewport.y) / Math.max(1, viewport.height),
    width: visible.width / Math.max(1, viewport.width),
    height: visible.height / Math.max(1, viewport.height),
  };
}

type ResizeEdge = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';

export function resizePhoneFrameTransform(
  composition: ClipComposition,
  clip: VisualClip,
  transform: NormalizedTransform,
  bounds: { dx: number; dy: number; dw: number; dh: number },
  delta: { x: number; y: number },
  edge?: ResizeEdge,
) {
  if (!isPhoneFrame(clip.appearance.frame)) return transform;
  const preset = clip.cameraFramingPreset ?? 'custom';
  const asset = composition.assets.find((entry) => entry.id === clip.assetId);
  const sourceWidth = asset?.width ?? bounds.dw;
  const sourceHeight = asset?.height ?? bounds.dh;
  const visible = visualClipDisplayLayout(
    clip,
    transform,
    { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh },
    sourceWidth,
    sourceHeight,
    preset,
  );
  const phone = {
    x: (visible.left - bounds.dx) / Math.max(1, bounds.dw),
    y: (visible.top - bounds.dy) / Math.max(1, bounds.dh),
    width: visible.width / Math.max(1, bounds.dw),
    height: visible.height / Math.max(1, bounds.dh),
  };
  const left = edge?.includes('left') ?? false;
  const top = edge?.includes('top') ?? false;
  const horizontal = left || (edge?.includes('right') ?? false);
  const vertical = top || (edge?.includes('bottom') ?? false);
  const widthScale = horizontal ? (phone.width + (left ? -delta.x : delta.x)) / phone.width : 1;
  const heightScale = vertical ? (phone.height + (top ? -delta.y : delta.y)) / phone.height : 1;
  const requestedScale = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale;
  const scale = Math.max(0.02 / Math.max(phone.width, phone.height), requestedScale);
  const resized = {
    width: phone.width * scale,
    height: phone.height * scale,
    x: horizontal
      ? left
        ? phone.x + phone.width - phone.width * scale
        : phone.x
      : phone.x + (phone.width * (1 - scale)) / 2,
    y: vertical
      ? top
        ? phone.y + phone.height - phone.height * scale
        : phone.y
      : phone.y + (phone.height * (1 - scale)) / 2,
  };
  if (preset !== 'fit') {
    const width = resized.width / Math.max(0.0001, phone.width / transform.width);
    const height = resized.height / Math.max(0.0001, phone.height / transform.height);
    return {
      x: resized.x - ((phone.x - transform.x) / transform.width) * width,
      y: resized.y - ((phone.y - transform.y) / transform.height) * height,
      width,
      height,
    };
  }
  const sourceAspect = Math.max(1, sourceWidth) / Math.max(1, sourceHeight);
  const phoneAspect = resized.width / Math.max(0.0001, resized.height);
  const fitted =
    sourceAspect >= phoneAspect
      ? {
          x: resized.x + (resized.width - resized.height * sourceAspect) / 2,
          y: resized.y,
          width: resized.height * sourceAspect,
          height: resized.height,
        }
      : {
          x: resized.x,
          y: resized.y + (resized.height - resized.width / sourceAspect) / 2,
          width: resized.width,
          height: resized.width / sourceAspect,
        };
  return fitted;
}
