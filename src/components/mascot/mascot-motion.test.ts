import { describe, expect, it } from 'vitest';
import { createMascotMotion, mascotIsAnimated, MASCOT_CELEBRATION_SECONDS } from './mascot-motion';
import type { MascotPhase } from './mascot-types';

const phases: MascotPhase[] = ['idle', 'preparing', 'recording', 'paused', 'processing', 'completed', 'failed'];

describe('Beam cloud motion', () => {
  it.each(phases)('renders a still readable cloud for reduced motion during %s', (phase) => {
    const sample = createMascotMotion(phase);
    expect(sample(0, true)).toEqual(sample(90, true));
    expect(sample(0, true).frame.eyes).toHaveLength(2);
    expect(sample(0, true).frame.dots).toHaveLength(0);
    expect(mascotIsAnimated(phase, 0, true)).toBe(false);
  });
  it.each(['idle', 'paused', 'failed'] as const)('keeps %s quiet without a frame loop', (phase) => {
    const sample = createMascotMotion(phase);
    expect(sample(0)).toEqual(sample(100));
    expect(mascotIsAnimated(phase, 0, false)).toBe(false);
  });
  it('dances and morphs the cloud during real export work', () => {
    const sample = createMascotMotion('processing');
    const initial = sample(0);
    const middle = sample(1.8);
    expect(middle.frame.bodyPath).not.toBe(initial.frame.bodyPath);
    expect(sample(0.45).transform).toContain('rotate(6deg)');
    expect(sample(0.45).transform).toContain('scale(1.055, 0.945)');
    expect(mascotIsAnimated('processing', 500, false)).toBe(true);
  });
  it('uses a much smaller recording movement than its export dance', () => {
    const sample = createMascotMotion('recording');
    expect(sample(0.9).transform).toContain('rotate(1.5deg)');
    expect(sample(0.9).transform).toContain('scale(1.015, 0.985)');
    expect(mascotIsAnimated('recording', 500, false)).toBe(true);
    expect(mascotIsAnimated('preparing', 0, false)).toBe(true);
  });
  it('celebrates once, uses theme confetti, and settles back into a cloud', () => {
    const sample = createMascotMotion('completed');
    expect(sample(0.3).frame.dots.length).toBeGreaterThan(0);
    expect(sample(0.3).frame.dots.every((dot) => dot.color?.startsWith('var(--color-'))).toBe(true);
    expect(sample(MASCOT_CELEBRATION_SECONDS).frame.dots).toHaveLength(0);
    expect(sample(MASCOT_CELEBRATION_SECONDS)).toEqual(sample(500));
    expect(mascotIsAnimated('completed', MASCOT_CELEBRATION_SECONDS - 0.001, false)).toBe(true);
    expect(mascotIsAnimated('completed', MASCOT_CELEBRATION_SECONDS, false)).toBe(false);
    expect(sample(500).frame.eyes).toHaveLength(2);
  });
  it.each([NaN, Infinity, -Infinity, -5])('clamps unusable elapsed time %s to the starting pose', (time) => {
    const sample = createMascotMotion('processing');
    expect(sample(time)).toEqual(sample(0));
    expect(sample(time).frame.bodyPath).not.toContain('NaN');
  });
  it.each(phases)('is repeatable when seeking forward and backward through %s', (phase) => {
    const sample = createMascotMotion(phase);
    const reference = sample(0.3);
    sample(10);
    sample(0);
    expect(sample(0.3)).toEqual(reference);
  });
});
