import type {
  ClipAppearance,
  NormalizedCrop,
  NormalizedTransform,
  WebcamAppearance,
  VisualClip,
} from '~/media/shared/composition-types';
import { isSplitCameraLayout, type CameraFramingPreset } from '~/media/shared/camera-layout-types';
import { DEFAULT_CLIP_APPEARANCE, drawDecoratedMedia } from '../appearance/render-decorated-media';
import type { MediaRect } from '../appearance/appearance-types';
import type { Canvas2DContext } from '~/types/canvas';
import { resolveCameraFraming } from '../camera-layout';
import { isPhoneFrame } from '../appearance/phone-frames';

export interface WebcamOverlaySettings {
  widthPercent: number;
  heightPercent: number;
  margin: number;
  reactToZoom: boolean;
  mirror: boolean;
  mirrorY: boolean;
  cornerRadius: number;
  shadowOpacity: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
}
export interface WebcamLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_WEBCAM_SETTINGS: WebcamOverlaySettings = {
  widthPercent: 40,
  heightPercent: 40,
  margin: 24,
  reactToZoom: true,
  mirror: true,
  mirrorY: false,
  cornerRadius: 14,
  shadowOpacity: 0.42,
  shadowColor: '#000000',
  shadowOffsetX: 0,
  shadowOffsetY: 1,
};

const cornerRadii: Record<string, number> = { none: 0, sm: 8, md: 14, lg: 24, full: Number.MAX_SAFE_INTEGER };
const shadowOpacities: Record<string, number> = { none: 0, sm: 0.28, md: 0.42, lg: 0.58 };
export function webcamSettingsForAppearance(
  appearance: WebcamAppearance | ClipAppearance | undefined,
  isMirrored?: boolean,
  isMirroredY?: boolean,
): WebcamOverlaySettings {
  const mirror = isMirrored ?? DEFAULT_WEBCAM_SETTINGS.mirror;
  const mirrorY = isMirroredY ?? DEFAULT_WEBCAM_SETTINGS.mirrorY;
  if (!appearance) return { ...DEFAULT_WEBCAM_SETTINGS, mirror, mirrorY };
  const direction = 'shadowDirection' in appearance ? appearance.shadowDirection : 'all';
  const offsets =
    direction === 'top-left'
      ? [-0.7, -0.7]
      : direction === 'bottom-right'
        ? [0.7, 0.7]
        : direction === 'all'
          ? [0, 0]
          : [0, 1];
  const cornerRadius =
    typeof appearance.cornerRadius === 'number'
      ? appearance.cornerRadius
      : (cornerRadii[appearance.cornerRadius] ?? DEFAULT_WEBCAM_SETTINGS.cornerRadius);
  const shadowOpacity =
    typeof appearance.shadowSize === 'number'
      ? appearance.shadowSize
      : (shadowOpacities[appearance.shadowSize] ?? DEFAULT_WEBCAM_SETTINGS.shadowOpacity);
  return {
    ...DEFAULT_WEBCAM_SETTINGS,
    mirror,
    mirrorY,
    cornerRadius,
    shadowOpacity,
    shadowColor: 'shadowColor' in appearance ? appearance.shadowColor : '#000000',
    shadowOffsetX: offsets[0],
    shadowOffsetY: offsets[1],
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const getWebcamZoomFactor = (appliedZoomScale: number, reactToZoom: boolean) =>
  reactToZoom ? 1 / (Number.isFinite(appliedZoomScale) && appliedZoomScale > 0 ? appliedZoomScale : 1) : 1;

export const webcamReactsToZoom = (clip: Pick<VisualClip, 'reactToZoom' | 'cameraLayoutPreset'>): boolean =>
  clip.reactToZoom ?? !isSplitCameraLayout(clip.cameraLayoutPreset ?? 'custom');

export const clampWebcamTransformToVisibleBounds = (
  value: NormalizedTransform,
  appliedZoomScale: number,
  reactToZoom: boolean,
): NormalizedTransform => {
  const width = clamp(value.width, 0.02, 1);
  const height = clamp(value.height, 0.02, 1);
  const factor = getWebcamZoomFactor(appliedZoomScale, reactToZoom);
  const zoomInset = 1 - factor;
  return {
    x: clamp(value.x, zoomInset > 0 ? -width * zoomInset : 0, 1 - width),
    y: clamp(value.y, zoomInset > 0 ? -height * zoomInset : 0, 1 - height),
    width,
    height,
  };
};

export const clampWebcamTransform = (value: NormalizedTransform): NormalizedTransform =>
  clampWebcamTransformToVisibleBounds(value, 1, false);

export function computeWebcamLayout(
  canvasWidth: number,
  canvasHeight: number,
  appliedZoomScale: number,
  settings = DEFAULT_WEBCAM_SETTINGS,
  transform?: NormalizedTransform,
): WebcamLayout {
  if (transform) {
    const factor = getWebcamZoomFactor(appliedZoomScale, settings.reactToZoom);
    const width = clamp(canvasWidth * transform.width * factor, 56, canvasWidth);
    const height = clamp(canvasHeight * transform.height * factor, 56, canvasHeight);
    // A stored transform records the overlay's edges. When zoom shrinks the
    // webcam, preserve its right and bottom offsets instead of moving it inward.
    return {
      width,
      height,
      x: clamp(canvasWidth * (transform.x + transform.width) - width, 0, canvasWidth - width),
      y: clamp(canvasHeight * (transform.y + transform.height) - height, 0, canvasHeight - height),
    };
  }
  const margin = Math.max(0, settings.margin);
  const maximum = Math.max(56, Math.min(canvasWidth, canvasHeight) - margin * 2);
  const factor = getWebcamZoomFactor(appliedZoomScale, settings.reactToZoom);
  const dimension = (percent: number) =>
    clamp(((Math.min(canvasWidth, canvasHeight) * clamp(percent, 10, 100)) / 100) * factor, 56, maximum);
  const width = dimension(settings.widthPercent);
  const height = dimension(settings.heightPercent);
  return {
    width,
    height,
    x: Math.max(margin, canvasWidth - width - margin),
    y: Math.max(margin, canvasHeight - height - margin),
  };
}

export function normalizeWebcamTransformToVisibleFraming(
  canvasWidth: number,
  canvasHeight: number,
  appliedZoomScale: number,
  settings: WebcamOverlaySettings,
  transform: NormalizedTransform,
  framingPreset: CameraFramingPreset,
  sourceWidth: number,
  sourceHeight: number,
): NormalizedTransform {
  if (framingPreset === 'custom' || framingPreset === 'fill') return clampWebcamTransform(transform);

  const layout = computeWebcamLayout(canvasWidth, canvasHeight, appliedZoomScale, settings, transform);
  const visible = resolveCameraFraming(framingPreset, layout, sourceWidth, sourceHeight).rect;
  const zoomFactor = getWebcamZoomFactor(appliedZoomScale, settings.reactToZoom);
  const width = visible.width / Math.max(1, canvasWidth) / zoomFactor;
  const height = visible.height / Math.max(1, canvasHeight) / zoomFactor;
  const right = (visible.x + visible.width) / Math.max(1, canvasWidth);
  const bottom = (visible.y + visible.height) / Math.max(1, canvasHeight);

  return clampWebcamTransformToVisibleBounds(
    { x: right - width, y: bottom - height, width, height },
    appliedZoomScale,
    settings.reactToZoom,
  );
}

export function drawWebcamOverlay(
  ctx: Canvas2DContext,
  source: CanvasImageSource,
  sourceDimensions: { width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  appliedZoomScale: number,
  settings = DEFAULT_WEBCAM_SETTINGS,
  transform?: NormalizedTransform,
  crop?: NormalizedCrop,
  appearance?: ClipAppearance,
  title = 'Camera',
  shadowScale = 1,
  framingPreset: CameraFramingPreset = 'custom',
) {
  const layout = computeWebcamLayout(canvasWidth, canvasHeight, appliedZoomScale, settings, transform);
  const sourceWidth = sourceDimensions.width;
  const sourceHeight = sourceDimensions.height;
  const framing = resolveCameraFraming(
    framingPreset,
    layout,
    sourceWidth,
    sourceHeight,
    crop,
    settings.mirror,
    settings.mirrorY,
  );
  const sourceRect: MediaRect | undefined = framing.sourceRect;
  drawDecoratedMedia(ctx, {
    source,
    sourceRect,
    rect: framingPreset === 'custom' && appearance && isPhoneFrame(appearance.frame) ? layout : framing.rect,
    appearance: { ...DEFAULT_CLIP_APPEARANCE, ...appearance },
    shadowScale,
    title,
    mirrored: settings.mirror,
    mirroredY: settings.mirrorY,
    mask: framing.mask,
  });
}
