import { getCaptionTransform, type Clip } from '~/media/shared/composition-types';
import { resolveClipTransitionState } from '~/media/shared/clip-transitions';
import type { Canvas2DContext } from '~/types/canvas';

export interface TransitionFrame {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const transitionFrameForClip = (clip: Clip, frame: TransitionFrame): TransitionFrame => {
  const transform =
    'transform' in clip && clip.transform ? clip.transform : clip.kind === 'caption' ? getCaptionTransform(clip) : null;
  if (!transform) return frame;
  return {
    x: (frame.x ?? 0) + transform.x * frame.width,
    y: (frame.y ?? 0) + transform.y * frame.height,
    width: transform.width * frame.width,
    height: transform.height * frame.height,
  };
};

export function transitionPointWithClip(
  clip: Clip,
  timeMs: number,
  frame: TransitionFrame,
  point: { x: number; y: number },
) {
  const state = resolveClipTransitionState(clip, timeMs);
  const clipFrame = transitionFrameForClip(clip, frame);
  const centerX = (clipFrame.x ?? 0) + clipFrame.width / 2;
  const centerY = (clipFrame.y ?? 0) + clipFrame.height / 2;
  return {
    x: centerX + (point.x - centerX) * state.scale + state.translateX * clipFrame.width,
    y: centerY + (point.y - centerY) * state.scale + state.translateY * clipFrame.height,
  };
}

export function drawWithClipTransition(
  ctx: Canvas2DContext,
  clip: Clip,
  timeMs: number,
  frame: TransitionFrame,
  draw: () => void,
) {
  if (!clip.transitions?.entry && !clip.transitions?.exit) return draw();
  const state = resolveClipTransitionState(clip, timeMs);
  const clipFrame = transitionFrameForClip(clip, frame);
  const centerX = (clipFrame.x ?? 0) + clipFrame.width / 2;
  const centerY = (clipFrame.y ?? 0) + clipFrame.height / 2;
  ctx.save();
  ctx.globalAlpha *= state.opacity;
  ctx.translate(state.translateX * clipFrame.width, state.translateY * clipFrame.height);
  if (state.scale !== 1) {
    ctx.translate(centerX, centerY);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-centerX, -centerY);
  }
  if (state.blur > 0) ctx.filter = `blur(${state.blur * (clipFrame.height / 1080)}px)`;
  draw();
  ctx.restore();
}
