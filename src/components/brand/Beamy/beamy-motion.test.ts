import { describe, expect, it } from 'vitest';
import { createBeamyMotion, beamyIsAnimated, BEAMY_CELEBRATION_SECONDS, BEAMY_ACTION_COUNT } from './beamy-motion';
import { SHAPES, SHAPE_BY_ID } from './engine/skins';
import type { BeamyPhase } from './beamy-types';
const phases: BeamyPhase[] = [
  'idle',
  'loading',
  'preparing',
  'recording',
  'paused',
  'processing',
  'completed',
  'failed',
];

describe('Beamy action motion', () => {
  it('loops from the cloud to loading dots and back without a discontinuity', () => {
    const sample = createBeamyMotion('loading');
    expect(sample(0).frame.bodyPath).toEqual(sample(3.6).frame.bodyPath);
    expect(sample(1.5).frame.bodyPath).not.toEqual(sample(0).frame.bodyPath);
    expect(sample(1.5).frame.dots).toHaveLength(2);
    expect(sample(3.59).frame.bodyPath).toEqual(sample(0).frame.bodyPath);
    expect(beamyIsAnimated('loading', 400, false)).toBe(true);
  });
  it('uses a sad cloud with rounded eyes on failure and restores sparkle eyes after recovery', () => {
    const failed = createBeamyMotion('failed')(0);
    const normal = createBeamyMotion('idle')(0);
    expect(failed.shape).toEqual(normal.shape);
    expect(failed.frame.eyes).not.toEqual(normal.frame.eyes);
    expect(failed.frame.bodyPath).not.toMatch(/NaN|Infinity/);
    expect(createBeamyMotion('idle')(0)).toEqual(normal);
  });
  it('uses exactly the shared Mascot Lab cloud as its resting silhouette', () => {
    expect(createBeamyMotion('idle')(0).shape).toEqual(SHAPE_BY_ID.get('nuage')!.radii);
  });
  it('offers twelve distinct action paths that each visit all engine shapes', () => {
    const paths = new Set<string>();
    for (let variation = 0; variation < BEAMY_ACTION_COUNT; variation++) {
      const sample = createBeamyMotion('processing', variation);
      const frames = Array.from({ length: SHAPES.length }, (_, index) => sample(index * 0.8).frame.bodyPath);
      expect(new Set(frames).size).toBe(SHAPES.length);
      paths.add(frames.join('|'));
    }
    expect(paths.size).toBe(12);
  });
  it.each(phases)('keeps the normal cloud and sparkle eyes readable for reduced motion during %s', (phase) => {
    const sample = createBeamyMotion(phase);
    expect(sample(0, true)).toEqual(sample(90, true));
    expect(sample(0, true).frame.eyes).toHaveLength(2);
    expect(sample(0, true).frame.dots).toHaveLength(0);
    expect(beamyIsAnimated(phase, 0, true)).toBe(false);
  });
  it.each(['idle', 'recording', 'paused', 'failed'] as const)('keeps %s at its cloud without an idle loop', (phase) => {
    const sample = createBeamyMotion(phase);
    expect(sample(0)).toEqual(sample(100));
    expect(beamyIsAnimated(phase, 0, false)).toBe(false);
  });
  it.each(['processing', 'preparing'] as const)('morphs continuously through every engine shape during %s', (phase) => {
    const sample = createBeamyMotion(phase);
    const interval = phase === 'processing' ? 0.8 : 1.4;
    const silhouettes = new Set(
      Array.from({ length: SHAPES.length }, (_, index) => sample(index * interval).frame.bodyPath),
    );
    expect(silhouettes.size).toBe(SHAPES.length);
    const before = sample(interval - 0.00001).shape;
    const after = sample(interval + 0.00001).shape;
    expect(Math.max(...before.map((radius, index) => Math.abs(radius - after[index]!)))).toBeLessThan(0.0001);
    expect(beamyIsAnimated(phase, 500, false)).toBe(true);
  });
  it('preserves an interrupted silhouette then eases back into the exact resting cloud', () => {
    const displayed = createBeamyMotion('processing')(1.3);
    const idle = createBeamyMotion('idle');
    expect(idle(0, false, displayed.shape, 0).shape).toEqual(displayed.shape);
    expect(idle(0, false, displayed.shape, 0.5).shape).not.toEqual(displayed.shape);
    expect(idle(0, false, displayed.shape, 1)).toEqual(idle(0));
  });
  it('celebrates once with theme particles and returns to the same cloud', () => {
    const sample = createBeamyMotion('completed');
    expect(sample(0.3).frame.dots.length).toBeGreaterThan(0);
    expect(sample(0.3).frame.dots.every((dot) => dot.color?.startsWith('var(--color-'))).toBe(true);
    expect(sample(BEAMY_CELEBRATION_SECONDS).frame.dots).toHaveLength(0);
    expect(sample(BEAMY_CELEBRATION_SECONDS)).toEqual(sample(500));
    expect(beamyIsAnimated('completed', BEAMY_CELEBRATION_SECONDS - 0.001, false)).toBe(true);
    expect(beamyIsAnimated('completed', BEAMY_CELEBRATION_SECONDS, false)).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity, -5])('clamps unusable elapsed time %s', (time) => {
    const sample = createBeamyMotion('processing');
    expect(sample(time)).toEqual(sample(0));
  });
  it.each([NaN, Infinity, -2, 2, 8, 20])('accepts a generic cycle offset %s without corrupting geometry', (offset) => {
    expect(createBeamyMotion('processing', offset)(0.4).frame.bodyPath).not.toMatch(/NaN|Infinity/);
  });
  it.each(phases)('is repeatable when seeking through %s', (phase) => {
    const sample = createBeamyMotion(phase);
    const reference = sample(0.3);
    sample(10);
    sample(0);
    expect(sample(0.3)).toEqual(reference);
  });
});
