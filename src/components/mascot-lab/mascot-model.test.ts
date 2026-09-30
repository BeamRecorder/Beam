import { describe, expect, it } from 'vitest';
import { createMascotEngine, DEFAULT_LOOK, timelineDuration, timelinePosition } from './mascot-catalog';
import { defaultPreset, parsePreset } from './mascot-storage';
import { eyeShapePath } from './bot/eye-shape';
import { capsulePath } from './bot/shape';
import type { MascotStep } from './mascot-types';

describe('mascot geometry', () => {
  it('creates the default sparkle face with deterministic frames', () => {
    const engine = createMascotEngine(DEFAULT_LOOK);
    expect(engine.sample(0.8)).toEqual(engine.sample(0.8));
    expect(engine.sample(0.8).eyes).toHaveLength(2);
    expect(engine.sample(0.8).bodyPath).not.toMatch(/NaN|Infinity/);
  });
  it('retains the original capsule geometry', () => {
    expect(eyeShapePath(20, 40, 'capsule', 'capsule', 1)).toBe(capsulePath(20, 40));
    expect(eyeShapePath(20, 40, 'capsule', 'sparkle', -2)).toBe(capsulePath(20, 40));
    expect(eyeShapePath(40, 20, 'star', 'capsule', 2)).toBe(capsulePath(40, 20));
  });
  it.each(['sparkle', 'star'] as const)('morphs to %s without losing path topology', (style) => {
    const start = eyeShapePath(30, 45, style, style, 0);
    const middle = eyeShapePath(30, 45, style, 'capsule', 0.5);
    expect(start).not.toEqual(middle);
    expect(start.match(/C/g)).toHaveLength(64);
    expect(middle.match(/C/g)).toHaveLength(64);
    expect(middle).not.toMatch(/NaN|Infinity/);
  });
  it.each([
    [20, 40],
    [40, 20],
    [30, 30],
  ])('keeps interpolated capsule eyes finite for %s × %s', (w, h) => {
    expect(eyeShapePath(w, h, 'capsule', 'star', 0.4)).not.toMatch(/NaN|Infinity/);
  });
  it('keeps a settled eye style unchanged when selected again', () => {
    const engine = createMascotEngine({ ...DEFAULT_LOOK, eyes: 'star' });
    const initial = engine.sample(1);
    engine.setEyes('star', 1);
    expect(engine.sample(1)).toEqual(initial);
  });
  it('morphs eyes through a timestamped transition and can replay it', () => {
    const engine = createMascotEngine({ ...DEFAULT_LOOK, eyes: 'capsule' });
    const before = engine.sample(1).eyes[0]!.d;
    engine.setEyes('sparkle', 1);
    expect(engine.sample(1).eyes[0]!.d).toEqual(before);
    const middle = engine.sample(1.1);
    expect(middle.eyes[0]!.d).not.toEqual(before);
    engine.sample(3);
    expect(engine.sample(1.1)).toEqual(middle);
  });
  it('renders a requested state rather than a fabricated idle face', () => {
    const frame = createMascotEngine(DEFAULT_LOOK, 'thinking').sample(1);
    expect(frame.eyes).toHaveLength(0);
    expect(frame.dots.length).toBeGreaterThan(0);
  });
});

describe('timeline positions', () => {
  const steps: MascotStep[] = [
    { state: 'idle', duration: 2 },
    { state: 'orbit', duration: 3 },
  ];
  it('sums the actual held durations', () => expect(timelineDuration(steps)).toBe(5));
  it('supports one step', () => expect(timelineDuration(steps.slice(0, 1))).toBe(2));
  it('reports zero for an empty timeline', () => expect(timelineDuration([])).toBe(0));
  it('locates an interior frame', () =>
    expect(timelinePosition(steps, 1.2)).toEqual({ index: 0, start: 0, offset: 1.2 }));
  it('uses half-open intervals at a transition', () =>
    expect(timelinePosition(steps, 2)).toEqual({ index: 1, start: 2, offset: 0 }));
  it('allows the end frame and clamps negative offsets', () => {
    expect(timelinePosition(steps, 5)).toEqual({ index: 1, start: 2, offset: 3 });
    expect(timelinePosition(steps, -1).offset).toBe(0);
    expect(timelinePosition([], 0).index).toBe(-1);
  });
});

describe('preset boundary validation', () => {
  it('round trips a complete look and animation', () =>
    expect(parsePreset(JSON.stringify(defaultPreset()))).toEqual(defaultPreset()));
  it('returns independent default objects', () => {
    const preset = defaultPreset();
    preset.look.color = '#000000';
    preset.timeline[0]!.duration = 9;
    expect(defaultPreset().look.color).toBe(DEFAULT_LOOK.color);
    expect(defaultPreset().timeline[0]!.duration).toBe(2);
  });
  it('strips unrecognized fields rather than carrying them into application state', () => {
    expect(parsePreset(JSON.stringify({ ...defaultPreset(), extra: 5 }))).not.toHaveProperty('extra');
  });
  it.each(['null', '[]', '{}', '{', '"mascot"'])('rejects an invalid root %s', (text) =>
    expect(() => parsePreset(text)).toThrow(),
  );
  it.each([
    { shape: 'invalid' },
    { expression: 'invalid' },
    { color: 'red' },
    { color: ['#ffffff'] },
    { eyes: 'hearts' },
    { blush: 1 },
  ])('rejects invalid look fields %j', (update) => {
    const preset = defaultPreset();
    expect(() => parsePreset(JSON.stringify({ ...preset, look: { ...preset.look, ...update } }))).toThrow();
  });
  it.each([
    [],
    null,
    [null],
    [1],
    [{}],
    [{ state: 'idle' }],
    [{ duration: 1 }],
    [{ state: 'missing', duration: 1 }],
    [{ state: 'idle', duration: 0.59 }],
    [{ state: 'idle', duration: 10.1 }],
    [{ state: 'idle', duration: '1' }],
    Array.from({ length: 33 }, () => ({ state: 'idle', duration: 1 })),
  ])('rejects an invalid timeline %j', (timeline) => {
    expect(() => parsePreset(JSON.stringify({ ...defaultPreset(), timeline }))).toThrow();
  });
  it('accepts duration boundaries and uppercase hex colors', () => {
    const preset = defaultPreset();
    preset.look.color = '#ABCDEF';
    preset.timeline = [
      { state: 'idle', duration: 0.6 },
      { state: 'wink', duration: 10 },
    ];
    expect(parsePreset(JSON.stringify(preset))).toEqual(preset);
  });
  it('rejects unsupported schema versions and absent looks', () => {
    expect(() => parsePreset(JSON.stringify({ ...defaultPreset(), version: 2 }))).toThrow();
    expect(() => parsePreset(JSON.stringify({ ...defaultPreset(), look: null }))).toThrow();
  });
});
