import type { ColorClip, ShapeClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { drawColorClip } from '@beam/runtime/composition/color/render-color-clip';
import { drawShapeClip } from '@beam/runtime/composition/shape/render-shape-clip';
import { drawWithClipTransition, type TransitionFrame } from '@beam/runtime/composition/transitions/render-transition';

export const drawExportGeneratedLayer = (
  ctx: Canvas2DContext,
  clip: ColorClip | ShapeClip,
  timeMs: number,
  frame: TransitionFrame,
) => {
  const viewport = { x: frame.x ?? 0, y: frame.y ?? 0, width: frame.width, height: frame.height };
  drawWithClipTransition(ctx, clip, timeMs, frame, () =>
    clip.kind === 'color' ? drawColorClip(ctx, clip, viewport) : drawShapeClip(ctx, clip, viewport),
  );
};
