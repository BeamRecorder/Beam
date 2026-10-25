import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { TransitionEffectState } from '@beam/engine/shared/transition-types';
import type { TransitionEffectRect } from './transition-effect-types';
import { drawTransitionEffect } from './transition-effects';

const layers = new WeakMap<Canvas2DContext, OffscreenCanvas>();
/** Isolate artwork only; inherited camera/group transforms and clipping remain on the destination. */
export function drawTransitionLayer(
  ctx: Canvas2DContext,
  frame: TransitionEffectRect,
  effect: TransitionEffectState,
  draw: (target: Canvas2DContext) => void,
  backdrop = false,
) {
  const { width, height } = ctx.canvas;
  if (width * height * 4 > 64 * 2 ** 20) throw new RangeError('Transition layer exceeds its memory budget.');
  let canvas = layers.get(ctx);
  if (!canvas) {
    canvas = new OffscreenCanvas(width, height);
    layers.set(ctx, canvas);
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const target = canvas.getContext('2d');
  if (!target) throw new Error('Transition layer context is unavailable.');
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, width, height);
  if (backdrop) target.drawImage(ctx.canvas, 0, 0);
  const matrix = ctx.getTransform();
  target.save();
  try {
    target.setTransform(matrix);
    draw(target);
  } finally {
    target.restore();
  }
  const corners = [
    [frame.x, frame.y],
    [frame.x + frame.width, frame.y],
    [frame.x, frame.y + frame.height],
    [frame.x + frame.width, frame.y + frame.height],
  ].map(([x, y]) => ({
    x: matrix.a * x! + matrix.c * y! + matrix.e,
    y: matrix.b * x! + matrix.d * y! + matrix.f,
  }));
  const x = Math.min(...corners.map((p) => p.x)),
    y = Math.min(...corners.map((p) => p.y));
  const region = {
    x: x / width,
    y: y / height,
    width: (Math.max(...corners.map((p) => p.x)) - x) / width,
    height: (Math.max(...corners.map((p) => p.y)) - y) / height,
  };
  if (region.width <= 0 || region.height <= 0) return;
  ctx.save();
  try {
    if (backdrop) {
      ctx.beginPath();
      ctx.rect(frame.x, frame.y, frame.width, frame.height);
      ctx.clip();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawTransitionEffect(ctx, canvas, { x: 0, y: 0, width, height }, effect, region);
  } finally {
    ctx.restore();
  }
}

export function releaseTransitionLayer(ctx: Canvas2DContext) {
  const canvas = layers.get(ctx);
  if (canvas) canvas.width = canvas.height = 1;
  layers.delete(ctx);
}
