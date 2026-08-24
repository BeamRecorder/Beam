import type { ColorClip, NormalizedTransform } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import { renderBackground } from '../background/render-background';

export function drawColorClip(
  context: Canvas2DContext,
  clip: ColorClip,
  viewport: { x: number; y: number; width: number; height: number },
  transform: NormalizedTransform = clip.transform,
) {
  renderBackground(context, {
    value: clip.fill,
    rect: {
      x: viewport.x + transform.x * viewport.width,
      y: viewport.y + transform.y * viewport.height,
      width: transform.width * viewport.width,
      height: transform.height * viewport.height,
    },
    blurPixels: 0,
  });
}
