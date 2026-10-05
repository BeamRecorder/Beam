import type { Canvas2DContext } from '../../canvas-types';
import type { AnimatedFrameRenderOptions } from './animated-frame-types';
import { AnimatedFrameRenderer } from './animated-frame-renderer';

// Painting is synchronous across contexts. One retained program bounds GPU ownership for all media.
let renderer: AnimatedFrameRenderer | undefined;
export function drawAnimatedFrame(ctx: Canvas2DContext, options: AnimatedFrameRenderOptions) {
  renderer ??= new AnimatedFrameRenderer();
  const { canvas, padding } = renderer.render(options);
  const { rect } = options;
  ctx.drawImage(canvas, rect.x - padding, rect.y - padding, rect.width + padding * 2, rect.height + padding * 2);
}

export function disposeAnimatedFrameRenderer() {
  renderer?.dispose();
  renderer = undefined;
}
