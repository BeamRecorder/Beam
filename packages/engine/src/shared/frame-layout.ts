import type { ClipFrame } from '@beam/engine/shared/composition-types';
import type { MediaRect } from '@beam/engine/shared/geometry-types';
import {
  normalizeFrameChromeScale,
  resolveContainedRect,
  resolveSafariFrameGeometry,
  resolvePhoneFrameGeometry,
  resolveWindowsFrameGeometry,
  type FrameOptions,
} from '@beam/engine/layout/frame-geometry';
import { isPhoneFrame } from '@beam/engine/shared/phone-frame-types';

export { normalizeFrameChromeScale };
export type WindowsFrameOptions = FrameOptions;

export const frameOuterRect = (rect: MediaRect, frame: ClipFrame): MediaRect =>
  isPhoneFrame(frame) ? resolvePhoneFrameGeometry(rect, frame).outer : rect;

export const transformedFrameOuterRect = (
  bounds: MediaRect,
  transform: { x: number; y: number; width: number; height: number },
  frame: ClipFrame,
): MediaRect =>
  frameOuterRect(
    {
      x: bounds.x + transform.x * bounds.width,
      y: bounds.y + transform.y * bounds.height,
      width: transform.width * bounds.width,
      height: transform.height * bounds.height,
    },
    frame,
  );

export const frameContentRect = (rect: MediaRect, frame: ClipFrame, windows: WindowsFrameOptions = {}): MediaRect => {
  if (frame === 'safari') return resolveSafariFrameGeometry(rect, windows.chromeScale).content;
  if (frame === 'windows-95') return resolveWindowsFrameGeometry(rect, windows).content;
  if (isPhoneFrame(frame)) return resolvePhoneFrameGeometry(rect, frame).content;
  return rect;
};

export const frameMediaRect = (
  rect: MediaRect,
  frame: ClipFrame,
  sourceWidth: number,
  sourceHeight: number,
  windows: WindowsFrameOptions = {},
): MediaRect => {
  const content = frameContentRect(rect, frame, windows);
  return isPhoneFrame(frame) ? resolveContainedRect(content, sourceWidth, sourceHeight) : content;
};

export const frameRadius = (frame: ClipFrame, fallback: number, rect: MediaRect) =>
  Math.min(
    frame === 'safari'
      ? resolveSafariFrameGeometry(rect).radius
      : isPhoneFrame(frame)
        ? resolvePhoneFrameGeometry(rect, frame).outerRadius
        : frame === 'windows-95'
          ? 0
          : fallback,
    rect.width / 2,
    rect.height / 2,
  );
