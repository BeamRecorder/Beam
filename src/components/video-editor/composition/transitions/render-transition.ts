import type { Clip } from '~/media/shared/composition-types';
import { resolveClipTransitionState } from '~/media/shared/clip-transitions';
import type { Canvas2DContext } from '~/types/canvas';

export function drawWithClipTransition(
  ctx: Canvas2DContext,
  clip: Clip,
  timeMs: number,
  canvas: { width: number; height: number },
  draw: () => void,
) {
  if (!clip.transitions?.entry && !clip.transitions?.exit) return draw();
  const state = resolveClipTransitionState(clip, timeMs);
  ctx.save();
  ctx.globalAlpha *= state.opacity;
  ctx.translate(state.translateX * canvas.width, state.translateY * canvas.height);
  if (state.scale !== 1) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }
  if (state.blur > 0) ctx.filter = `blur(${state.blur * (canvas.height / 1080)}px)`;
  draw();
  ctx.restore();
}
