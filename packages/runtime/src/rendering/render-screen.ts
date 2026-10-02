import { resolveScreenRenderGeometry } from '@beam/engine/composition/camera-layout';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '../canvas-types';
import type { RenderableMedia } from './render-types';
import { drawDecoratedMedia } from '../composition/appearance/render-decorated-media';

export function drawScreenMedia(
  context: Canvas2DContext,
  clip: VisualClip,
  media: RenderableMedia,
  canvas: { width: number; height: number; showBackground: boolean },
) {
  const geometry = resolveScreenRenderGeometry(
    clip,
    media.width,
    media.height,
    canvas.width,
    canvas.height,
    canvas.showBackground,
  );
  drawDecoratedMedia(context, {
    source: media.source,
    sourceRect: geometry.source,
    rect: geometry.positioned,
    appearance: clip.appearance,
    title: clip.name,
    mirrored: clip.isMirrored,
    mirroredY: clip.isMirroredY,
    mask: geometry.mask,
  });
}
