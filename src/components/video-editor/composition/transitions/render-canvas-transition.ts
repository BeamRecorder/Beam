import type { ClipTransitionState } from '~/media/shared/clip-transitions';
import type { Canvas2DContext } from '~/types/canvas';

export interface TransitionFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function drawCanvasTransitionFrame(
  ctx: Canvas2DContext,
  source: CanvasImageSource,
  sourceSize: { width: number; height: number },
  frame: TransitionFrameRect,
  state: ClipTransitionState,
  fallbackColor: string,
) {
  ctx.save();
  ctx.fillStyle = fallbackColor;
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  ctx.globalAlpha *= state.opacity;
  ctx.translate(state.translateX * frame.width, state.translateY * frame.height);
  ctx.translate(frame.x + frame.width / 2, frame.y + frame.height / 2);
  ctx.scale(state.scale, state.scale);
  ctx.translate(-(frame.x + frame.width / 2), -(frame.y + frame.height / 2));
  if (state.blur > 0) ctx.filter = `blur(${state.blur * (frame.height / 1080)}px)`;
  ctx.drawImage(source, 0, 0, sourceSize.width, sourceSize.height);
  ctx.restore();
}
