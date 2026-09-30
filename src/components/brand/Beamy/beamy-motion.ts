import { BotEngine } from './engine/engine';
import { SHAPE_BY_ID, SHAPES } from './engine/skins';
import { RAYON } from './engine/repere';
import type { BeamyMotionFrame, BeamyPhase } from './beamy-types';

const CLOUD = SHAPE_BY_ID.get('nuage')!.radii;
const SHAPE_CYCLE = [CLOUD, ...SHAPES.filter((shape) => shape.id !== 'nuage').map((shape) => shape.radii)];
const STILL = 'translate(0%, 0%) rotate(0deg) scale(1, 1)';
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export const BEAMY_CELEBRATION_SECONDS = 1.9;
export const BEAMY_SETTLE_SECONDS = 0.65;
export const BEAMY_ACTION_COUNT = 12;

export function beamyIsAnimated(phase: BeamyPhase, elapsed: number, reducedMotion: boolean): boolean {
  return (
    !reducedMotion &&
    (phase === 'loading' ||
      phase === 'preparing' ||
      phase === 'processing' ||
      (phase === 'completed' && elapsed < BEAMY_CELEBRATION_SECONDS))
  );
}

/** Clock-free action poses. Every shape shares one topology, so interrupted
 * actions can morph from their exact displayed silhouette instead of resetting. */
export function createBeamyMotion(phase: BeamyPhase, cycleOffset = 0) {
  const offset = Number.isFinite(cycleOffset) ? Math.max(0, Math.floor(cycleOffset)) : 0;
  // Both strides visit the complete eight-shape catalogue, in a different order.
  const stride = offset % BEAMY_ACTION_COUNT < SHAPE_CYCLE.length ? 1 : 3;
  const expression = {
    id: phase === 'failed' ? ('triste' as const) : ('heureux' as const),
    gaze: { yaw: 0, pitch: phase === 'failed' ? -13 : 0, roll: 0 },
    split: 22,
    eyes: [
      { w: 0.38, h: phase === 'failed' ? 0.38 : 0.46, open: 1 },
      { w: 0.38, h: phase === 'failed' ? 0.38 : 0.46, open: 1 },
    ] as const,
  };
  const engine = new BotEngine(RAYON, 'idle', CLOUD, { ...expression, eyes: [...expression.eyes] });
  engine.setEyes(phase === 'failed' ? 'capsule' : 'sparkle', -1);
  engine.setLook({ yaw: 0, pitch: phase === 'failed' ? -13 : 0, mix: 1, spin: 0, wander: 0 }, -1);
  return (elapsed: number, reducedMotion = false, fromShape = CLOUD, transition = 1): BeamyMotionFrame => {
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    if (phase === 'loading' && !reducedMotion) {
      const cycle = time % 3.6;
      // Seek the same morph forwards and backwards with zero velocity at each turn.
      // The engine's pose clock returns to zero too, including its tiny idle drift.
      const poseTime = 1.2 * (1 - Math.cos((cycle * Math.PI) / 1.8));
      engine.reset('idle', 0);
      if (poseTime >= 0.7) engine.setState('thinking', 0.7);
      return { frame: engine.sample(poseTime), transform: STILL, shape: CLOUD };
    }
    let target = CLOUD;
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
    const frame = engine.sample(0);
    if (!reducedMotion && phase === 'completed' && time < BEAMY_CELEBRATION_SECONDS) {
      const progress = time / BEAMY_CELEBRATION_SECONDS;
      frame.dots = Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        const distance = 30 + 100 * progress;
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          r: 3 * Math.sin(progress * Math.PI),
          opacity: Math.sin(progress * Math.PI) ** 2,
          color: ['var(--color-primary)', 'var(--color-warning)', 'var(--color-success)'][index % 3],
        };
      });
    }
    return { frame, transform: STILL, shape };
  };
}
