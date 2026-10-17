import type { Canvas2DContext } from '../canvas-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { RenderableMedia } from './render-types';
import { renderBackground } from '../composition/background/render-background';

export function drawSnapshotBackground(
  ctx: Canvas2DContext,
  snapshot: CompositionSnapshot,
  background: RenderableMedia | null | undefined,
) {
  const value = snapshot.background;
  if (!value && !background) return;
  if (background?.preRendered) {
    ctx.drawImage(background.source, 0, 0, snapshot.canvas.width, snapshot.canvas.height);
    return;
  }
  renderBackground(ctx, {
    value,
    source: background?.source,
    sourceSize: background ? { width: background.width, height: background.height } : undefined,
    rect: { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
    blurPixels: snapshot.blurPercent * 0.48,
  });
}
