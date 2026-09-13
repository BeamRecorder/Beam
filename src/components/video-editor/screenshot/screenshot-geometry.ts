import type { NormalizedCrop, NormalizedTransform } from '~/media/shared/composition-types';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { frameMediaRect } from '../composition/appearance/frames';
import { containedMediaRect } from '../canvas/output-canvas';
import { clampNormalizedCrop } from '../canvas/composables/layer-transform-geometry';

export function screenshotImageFraming(
  state: ScreenshotState,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  uncropped = false,
) {
  const crop =
    !uncropped && state.image.crop ? clampNormalizedCrop(state.image.crop) : { x: 0, y: 0, width: 1, height: 1 };
  const sourceRect = {
    x: crop.x * sourceWidth,
    y: crop.y * sourceHeight,
    width: crop.width * sourceWidth,
    height: crop.height * sourceHeight,
  };
  const transform = state.image.transform;
  const fitted = containedMediaRect(
    sourceRect.width,
    sourceRect.height,
    transform.width * width,
    transform.height * height,
  );
  return { rect: { ...fitted, x: transform.x * width + fitted.x, y: transform.y * height + fitted.y }, sourceRect };
}

export function moveScreenshotCrop(
  initial: NormalizedCrop,
  dx: number,
  dy: number,
  corner?: ResizeCorner,
): NormalizedCrop {
  if (!corner) return clampNormalizedCrop({ ...initial, x: initial.x + dx, y: initial.y + dy });
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const left = corner.includes('left') ? clamp(initial.x + dx, 0, initial.x + initial.width - 0.05) : initial.x;
  const top = corner.includes('top') ? clamp(initial.y + dy, 0, initial.y + initial.height - 0.05) : initial.y;
  const right = corner.includes('right')
    ? clamp(initial.x + initial.width + dx, left + 0.05, 1)
    : initial.x + initial.width;
  const bottom = corner.includes('bottom')
    ? clamp(initial.y + initial.height + dy, top + 0.05, 1)
    : initial.y + initial.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function screenshotCropBounds(state: ScreenshotState, sourceWidth: number, sourceHeight: number) {
  const { rect } = screenshotImageFraming(
    state,
    sourceWidth,
    sourceHeight,
    state.canvas.width,
    state.canvas.height,
    true,
  );
  const appearance = state.image.appearance;
  return frameMediaRect(rect, appearance.frame, sourceWidth, sourceHeight, {
    showMenu: appearance.frameShowMenu,
    showScrollbars: appearance.frameShowScrollbars,
    chromeScale: appearance.frameChromeScale,
  });
}

export function resizeScreenshotImage(
  initial: NormalizedTransform,
  frame: NormalizedTransform,
  dx: number,
  dy: number,
  corner: ResizeCorner,
): NormalizedTransform {
  const left = corner.includes('left'),
    top = corner.includes('top');
  const horizontal = left || corner.includes('right'),
    vertical = top || corner.includes('bottom');
  const scaleX = horizontal ? 1 + (left ? -dx : dx) / initial.width : 1;
  const scaleY = vertical ? 1 + (top ? -dy : dy) / initial.height : 1;
  const requested = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
  const scale = Math.max(
    0.02 / Math.min(initial.width, initial.height),
    Math.min(2 / Math.max(initial.width, initial.height), requested),
  );
  const width = initial.width * scale,
    height = initial.height * scale;
  const x = horizontal
    ? left
      ? initial.x + initial.width - width
      : initial.x
    : initial.x + (initial.width - width) / 2;
  const y = vertical
    ? top
      ? initial.y + initial.height - height
      : initial.y
    : initial.y + (initial.height - height) / 2;
  return {
    x: x + (frame.x - initial.x) * scale,
    y: y + (frame.y - initial.y) * scale,
    width: frame.width * scale,
    height: frame.height * scale,
  };
}
