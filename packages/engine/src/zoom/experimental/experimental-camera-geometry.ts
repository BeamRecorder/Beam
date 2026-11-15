import type { VisualClip } from '../../shared/composition-types';
import { resolveScreenRenderGeometry } from '../../composition/camera-layout';
import { frameMediaRect } from '../../shared/frame-layout';
import { isPhoneFrame } from '../../shared/phone-frame-types';
import type { ExperimentalGeometry } from './experimental-camera-types';

export const FULL_EXPERIMENTAL_GEOMETRY: ExperimentalGeometry = {
  crop: { x: 0, y: 0, width: 1, height: 1 },
  mask: { x: 0, y: 0, width: 1, height: 1 },
};

/** Both preview painters and export use the visible recording, after cropping and frame insets. */
export function experimentalScreenGeometry(
  screen: VisualClip,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  showBackground: boolean,
): ExperimentalGeometry {
  const geometry = resolveScreenRenderGeometry(screen, sourceWidth, sourceHeight, width, height, showBackground);
  const positioned = isPhoneFrame(screen.appearance.frame)
    ? frameMediaRect(geometry.positioned, screen.appearance.frame, geometry.source.width, geometry.source.height)
    : geometry.positioned;
  return {
    crop: {
      x: geometry.source.x / sourceWidth,
      y: geometry.source.y / sourceHeight,
      width: geometry.source.width / sourceWidth,
      height: geometry.source.height / sourceHeight,
    },
    mask: {
      x: positioned.x / width,
      y: positioned.y / height,
      width: positioned.width / width,
      height: positioned.height / height,
    },
  };
}
