import { renderBackground } from '../composition/background/render-background';
import type { Canvas2DContext } from '../canvas-types';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from './screenshot-types';
export function drawScreenshotBackground(
  target: Canvas2DContext,
  state: ScreenshotState,
  assets: Partial<ScreenshotRenderAssets>,
  width: number,
  height: number,
) {
  renderBackground(target, {
    value: state.background,
    source: assets.background,
    rect: { x: 0, y: 0, width, height },
    blurPixels: state.blurPercent * 0.48 * Math.min(width / state.canvas.width, height / state.canvas.height),
  });
}
