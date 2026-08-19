import type { Clip } from '~/media/shared/composition-types';
import { resolveClipTransitionState } from '~/media/shared/clip-transitions';
import type { Canvas2DContext } from '~/types/canvas';

export function drawWithClipTransition(
  ctx: Canvas2DContext,
  clip: Clip,
  timeMs: number,
  frame: { x?: number; y?: number; width: number; height: number },
  draw: () => void,
) {
  if (!clip.transitions?.entry && !clip.transitions?.exit) return draw();
  const state = resolveClipTransitionState(clip, timeMs);
  const centerX = (frame.x ?? 0) + frame.width / 2;
  const centerY = (frame.y ?? 0) + frame.height / 2;
  ctx.save();
  ctx.globalAlpha *= state.opacity;
  ctx.translate(state.translateX * frame.width, state.translateY * frame.height);
  if (state.scale !== 1) {
    ctx.translate(centerX, centerY);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-centerX, -centerY);
  }
  if (state.blur > 0) ctx.filter = `blur(${state.blur * (frame.height / 1080)}px)`;
  draw();
  ctx.restore();
}
