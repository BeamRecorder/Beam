import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { Canvas2DContext } from '../canvas-types';
import { EMPTY_CLIP_TRANSITIONS, resolveCanvasTransitionState } from '@beam/engine/shared/clip-transitions';
import { OUTPUT_FALLBACK_COLOR } from '@beam/engine/layout/output-canvas';
import { drawCanvasTransitionFrame } from '../composition/transitions/render-canvas-transition';
import { getCanvasTransitionSurface } from './canvas-transition-surface';

/** Canvas transitions wrap the completed composition, including camera-independent background layers. */
export function renderCanvasTransitionPass(
  context: Canvas2DContext,
  snapshot: CompositionSnapshot,
  time: number,
  draw: (target: Canvas2DContext) => void,
) {
  const transition = resolveCanvasTransitionState(
    snapshot.canvas.transitions ?? EMPTY_CLIP_TRANSITIONS,
    time * 1000,
    snapshot.duration * 1000,
  );
  const target = transition ? getCanvasTransitionSurface(snapshot.canvas.width, snapshot.canvas.height) : null;
  if (!transition || !target?.context) {
    draw(context);
    return;
  }
  draw(target.context);
  drawCanvasTransitionFrame(
    context,
    target.surface,
    { width: snapshot.canvas.width, height: snapshot.canvas.height },
    { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
    transition,
    OUTPUT_FALLBACK_COLOR,
  );
}
