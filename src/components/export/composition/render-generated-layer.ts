import type { ColorClip, ShapeClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import { drawColorClip } from '../../video-editor/composition/color/render-color-clip';
import { drawShapeClip } from '../../video-editor/composition/shape/render-shape-clip';
import {
  drawWithClipTransition,
  type TransitionFrame,
} from '../../video-editor/composition/transitions/render-transition';

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
