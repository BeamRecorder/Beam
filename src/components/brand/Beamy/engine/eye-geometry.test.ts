import { describe, expect, it } from 'vitest';
import { BotEngine } from './engine';
import { DEFAULT_EYE_GEOMETRY, EYE_GEOMETRY_LIMITS, validateEyeGeometry } from './eye-geometry';
import { SEQUENCE } from './states';
import type { EyeGeometry } from './bot-types';

describe('eye geometry boundary', () => {
  it('returns an independent validated copy and strips unrelated data', () => {
    const geometry = { ...DEFAULT_EYE_GEOMETRY, extra: 'ignored' };
    const copy = validateEyeGeometry(geometry);
    expect(copy).toEqual(DEFAULT_EYE_GEOMETRY);
    expect(copy).not.toBe(geometry);
    copy.size = 1.8;
    expect(geometry.size).toBe(1);
    expect(Object.isFrozen(DEFAULT_EYE_GEOMETRY)).toBe(true);
  });
  it.each([null, undefined, false, 'eyes', 1, []])('rejects invalid geometry %j', (value) => {
    expect(() => validateEyeGeometry(value)).toThrow('Réglages des yeux invalides');
  });
  it.each(Object.keys(EYE_GEOMETRY_LIMITS) as Array<keyof EyeGeometry>)('validates every %s boundary', (key) => {
    const [min, max] = EYE_GEOMETRY_LIMITS[key];
    for (const value of [min, max])
      expect(validateEyeGeometry({ ...DEFAULT_EYE_GEOMETRY, [key]: value })[key]).toBe(value);
    for (const value of [undefined, null, '1', NaN, Infinity, -Infinity, min - 0.01, max + 0.01]) {
      expect(() => validateEyeGeometry({ ...DEFAULT_EYE_GEOMETRY, [key]: value })).toThrow(key);
    }
  });
});

describe('engine eye proportions', () => {
  it('preserves the production geometry at defaults', () => {
    const engine = new BotEngine(100);
    const before = engine.sample(0.8);
    engine.setEyeGeometry({ ...DEFAULT_EYE_GEOMETRY });
    expect(engine.sample(0.8)).toEqual(before);
  });
  it.each(['size', 'width', 'height'] as const)('changes %s without changing the body or eye centers', (key) => {
    const engine = new BotEngine(100);
    const before = engine.sample(0.8);
    engine.setEyeGeometry({ ...DEFAULT_EYE_GEOMETRY, [key]: 1.4 });
    const after = engine.sample(0.8);
    expect(after.bodyPath).toBe(before.bodyPath);
    expect(after.eyes.map(({ matrix }) => matrix)).toEqual(before.eyes.map(({ matrix }) => matrix));
    expect(after.eyes[0]!.d).not.toBe(before.eyes[0]!.d);
  });
  it.each(['spacing', 'offsetY'] as const)('changes %s without changing eye shapes', (key) => {
    const engine = new BotEngine(100);
    const before = engine.sample(0.8);
    engine.setEyeGeometry({ ...DEFAULT_EYE_GEOMETRY, [key]: key === 'spacing' ? 1.4 : 0.2 });
    const after = engine.sample(0.8);
    expect(after.eyes.map(({ d }) => d)).toEqual(before.eyes.map(({ d }) => d));
    expect(after.eyes[0]!.matrix).not.toBe(before.eyes[0]!.matrix);
  });
  it('owns its geometry and preserves it after a rejected edit', () => {
    const engine = new BotEngine(100);
    const geometry = { ...DEFAULT_EYE_GEOMETRY, size: 1.4 };
    engine.setEyeGeometry(geometry);
    const before = engine.sample(0.8);
    geometry.size = 0.5;
    expect(engine.sample(0.8)).toEqual(before);
    expect(() => engine.setEyeGeometry({ ...geometry, size: NaN })).toThrow();
    expect(engine.sample(0.8)).toEqual(before);
  });
  it.each(SEQUENCE)('keeps %s deterministic and finite at minimum and maximum proportions', (state) => {
    for (const boundary of [0, 1] as const) {
      const engine = new BotEngine(100, state);
      const geometry = Object.fromEntries(
        Object.entries(EYE_GEOMETRY_LIMITS).map(([key, limits]) => [key, limits[boundary]]),
      ) as unknown as EyeGeometry;
      engine.setEyeGeometry(geometry);
      const frame = engine.sample(0.8);
      engine.sample(3);
      expect(engine.sample(0.8)).toEqual(frame);
      expect(JSON.stringify(frame)).not.toMatch(/NaN|Infinity/);
    }
  });
});
