import { BotEngine } from './engine/engine';
import { DEFAULT_SHAPE, SHAPE_BY_ID, SHAPES } from './engine/skins';
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from './engine/expressions';
import { RAYON } from './engine/repere';
import type { BeamyMotionFrame, BeamyPhase } from './beamy-types';
import { createBeamyLoadingMotion } from './beamy-loading-motion';

const REST_SHAPE = SHAPE_BY_ID.get(DEFAULT_SHAPE)!.radii;
const SHAPE_CYCLE = SHAPES.map((shape) => shape.radii);
const STILL = 'translate(0%, 0%) rotate(0deg) scale(1, 1)';
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export const BEAMY_CELEBRATION_SECONDS = 1.9;
export const BEAMY_SETTLE_SECONDS = 0.65;
export const BEAMY_ACTION_COUNT = 12;

export function beamyIsAnimated(phase: BeamyPhase, reducedMotion: boolean): boolean {
  return (
    !reducedMotion &&
    (phase === 'loading' ||
      phase === 'preparing' ||
      phase === 'processing' ||
      phase === 'failed' ||
      phase === 'completed')
  );
}

/** Clock-free action poses. Every shape shares one topology, so interrupted
 * actions can morph from their exact displayed silhouette instead of resetting. */
export function createBeamyMotion(phase: BeamyPhase, cycleOffset = 0) {
  const offset = Number.isFinite(cycleOffset) ? Math.max(0, Math.floor(cycleOffset)) : 0;
  // Both strides visit the complete eight-shape catalogue, in a different order.
  const stride = offset % BEAMY_ACTION_COUNT < SHAPE_CYCLE.length ? 1 : 3;
  const expression = EXPRESSION_BY_ID.get(
    phase === 'failed' ? 'triste' : phase === 'completed' ? 'heureux' : DEFAULT_EXPRESSION,
  )!;
  const engine = new BotEngine(RAYON, 'idle', REST_SHAPE, expression);
  const loading = phase === 'loading' ? createBeamyLoadingMotion() : null;
  return (elapsed: number, reducedMotion = false, fromShape = REST_SHAPE, transition = 1): BeamyMotionFrame => {
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    if (phase === 'loading') {
      return {
        frame: loading!(reducedMotion ? 0 : time),
        transform: STILL,
        shape: REST_SHAPE,
      };
    }
    let target = REST_SHAPE;
    if (!reducedMotion && (phase === 'processing' || phase === 'preparing')) {
      const segment = time / (phase === 'processing' ? 0.8 : 1.4);
      const index = Math.floor(segment) * stride + offset;
      const from = SHAPE_CYCLE[index % SHAPE_CYCLE.length]!;
      const to = SHAPE_CYCLE[(index + stride) % SHAPE_CYCLE.length]!;
      const progress = smooth((segment - Math.floor(segment) - 0.25) / 0.75);
      target = from.map((radius, point) => radius + (to[point]! - radius) * progress);
    }
    const mix = reducedMotion ? 1 : smooth(transition);
    const shape = target.map((radius, point) => fromShape[point]! + (radius - fromShape[point]!) * mix);
    engine.setShape(shape, -1);
    const frame = engine.sample((phase === 'failed' || phase === 'completed') && !reducedMotion ? time : 0);
    if (!reducedMotion && phase === 'completed' && time < BEAMY_CELEBRATION_SECONDS) {
      const progress = time / BEAMY_CELEBRATION_SECONDS;
      frame.dots = Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        const distance = 108 + 35 * progress;
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          r: 7 * Math.sin(progress * Math.PI),
          opacity: Math.sin(progress * Math.PI) ** 2,
          color: ['var(--color-primary)', 'var(--color-warning)', 'var(--color-success)'][index % 3],
        };
      });
    }
    return { frame, transform: STILL, shape };
  };
}
