import type { ClipTransition } from '@beam/engine/shared/composition-types';
import {
  DEFAULT_TRANSITION_EASING_POWER,
  MAX_TRANSITION_EASING_POWER,
  MIN_TRANSITION_EASING_POWER,
} from '@beam/engine/shared/clip-transitions';
import type { TimelineCanvasPalette } from './timeline-canvas-types';

export function paintTimelineTransition(
  ctx: CanvasRenderingContext2D,
  edge: 'entry' | 'exit',
  transition: ClipTransition,
  rect: { x: number; width: number; height: number },
  palette: TimelineCanvasPalette,
): void {
  if (rect.width <= 0) return;
  const power = Math.max(
    MIN_TRANSITION_EASING_POWER,
    Math.min(MAX_TRANSITION_EASING_POWER, transition.easingPower ?? DEFAULT_TRANSITION_EASING_POWER),
  );
  const points = Array.from({ length: 25 }, (_, index) => {
    const time = index / 24,
      opacity = edge === 'entry' ? 1 - (1 - time) ** power : (1 - time) ** power;
    return [rect.x + 2 + time * Math.max(0, rect.width - 4), 4 + (1 - opacity) * Math.max(1, rect.height - 8)] as const;
  });
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, 2, rect.width, rect.height - 4);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(rect.x, 2);
  ctx.lineTo(rect.x + rect.width, 2);
  for (const point of [...points].reverse()) ctx.lineTo(...point);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.curve;
  ctx.globalAlpha *= 0.38;
  ctx.lineWidth = 0.7;
  const start = Math.max(rect.x - rect.height, -rect.height),
    end = Math.min(rect.x + rect.width + rect.height, ctx.canvas.width + rect.height);
  for (let x = start; x < end; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, rect.height);
    ctx.lineTo(x + rect.height, 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  points.forEach((point, index) => (index ? ctx.lineTo(...point) : ctx.moveTo(...point)));
  ctx.strokeStyle = palette.background;
  ctx.lineWidth = 2.75;
  ctx.stroke();
  ctx.strokeStyle = palette.curve;
  ctx.lineWidth = 1.25;
  ctx.globalAlpha *= 0.82;
  ctx.stroke();
  ctx.restore();
}
