import type { BlurClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '../canvas-types';
import { applyBlurEffect } from '../composition/effects/blur-effect';

export function drawBlurClip(ctx: Canvas2DContext, clip: BlurClip, canvas: { width: number; height: number }) {
  applyBlurEffect(ctx, clip, {
    x: clip.transform.x * canvas.width,
    y: clip.transform.y * canvas.height,
    width: clip.transform.width * canvas.width,
    height: clip.transform.height * canvas.height,
  });
}
