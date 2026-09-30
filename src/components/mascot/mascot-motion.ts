import { BotEngine } from '../mascot-lab/bot/engine';
import { EXPRESSION_BY_ID } from '../mascot-lab/bot/expressions';
import { SHAPE_BY_ID } from '../mascot-lab/bot/skins';
import { RAYON } from '../mascot-lab/bot/repere';
import type { ExpressionId } from '../mascot-lab/bot/bot-types';
import type { MascotMotionFrame, MascotPhase } from './mascot-types';

const CLOUD = SHAPE_BY_ID.get('nuage')!.radii;
const CUSHION = SHAPE_BY_ID.get('capsule')!.radii;
const EXPRESSIONS: Record<MascotPhase, ExpressionId> = {
  idle: 'heureux',
  preparing: 'curieux',
  recording: 'attentif',
  paused: 'somnolent',
  processing: 'excite',
  completed: 'fier',
  failed: 'confus',
};
const CONFETTI_COLORS = ['var(--color-primary)', 'var(--color-warning)', 'var(--color-success)'];
const STILL = 'translate(0%, 0%) rotate(0deg) scale(1, 1)';
const CELEBRATION_SPEED = 1.6;
export const MASCOT_CELEBRATION_SECONDS = 3.05 / CELEBRATION_SPEED;

export function mascotIsAnimated(phase: MascotPhase, elapsed: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  return (
    phase === 'preparing' ||
    phase === 'recording' ||
    phase === 'processing' ||
    (phase === 'completed' && elapsed < MASCOT_CELEBRATION_SECONDS)
  );
}

/** A clock-free player: sampling the same phase/time always produces the same SVG. */
export function createMascotMotion(phase: MascotPhase) {
  const expression = EXPRESSION_BY_ID.get(EXPRESSIONS[phase])!;
  const resting = new BotEngine(RAYON, 'idle', CLOUD, expression);
  resting.setEyes('sparkle', -1);
  resting.setLook({ yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 0.2 }, -1);

  const celebration = new BotEngine(RAYON, 'burst', CLOUD, expression);
  celebration.setEyes('sparkle', -1);
  // Schedule the return to the cloud once. The engine can sample before and
  // after this transition, so progress notifications cannot repeat the burst.
  celebration.setState('idle', 2.6);

  return (elapsed: number, reducedMotion = false): MascotMotionFrame => {
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    if (reducedMotion || ['idle', 'paused', 'failed'].includes(phase)) {
      resting.setShape(CLOUD, -1);
      return { frame: resting.sample(0), transform: STILL };
    }
    if (phase === 'completed') {
      const frame = celebration.sample(Math.min(time * CELEBRATION_SPEED, 3.05));
      return {
        frame: {
          ...frame,
          dots: frame.dots.map((dot, index) => ({ ...dot, color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] })),
        },
        transform: STILL,
      };
    }

    const dancing = phase === 'processing';
    const beat = Math.sin((time * Math.PI * 2) / (dancing ? 1.8 : 3.6));
    const morph = dancing ? 0.58 * Math.sin((time * Math.PI) / 3.6) ** 2 : 0;
    resting.setShape(
      CLOUD.map((radius, index) => radius + (CUSHION[index]! - radius) * morph),
      time - 1,
    );
    const squash = beat * (dancing ? 0.055 : 0.015);
    return {
      frame: resting.sample(time),
      transform: `translate(0%, ${-Math.abs(beat) * (dancing ? 4 : 1)}%) rotate(${beat * (dancing ? 6 : 1.5)}deg) scale(${1 + squash}, ${1 - squash})`,
    };
  };
}
