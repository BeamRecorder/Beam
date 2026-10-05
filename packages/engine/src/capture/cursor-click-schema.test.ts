import { describe, expect, it } from 'vitest';
import {
  CURSOR_CLICK_LIMITS,
  CURSOR_RING_DEFAULTS,
  DEFAULT_CURSOR_WATER_RIPPLE,
  createDefaultCursorClickEffects,
  normalizeCursorClickEffect,
  normalizeCursorWaterRipple,
  validateCursorClickEffect,
} from './cursor-click-schema.js';
import { normalizeCursorClickEffects } from './cursor-settings';
import { createDefaultCursorPresentation } from './cursor-presentation';

describe('independent cursor click documents', () => {
  it('creates gentle defaults with separate records for buttons, waves and presentations', () => {
    const a = createDefaultCursorClickEffects(),
      b = createDefaultCursorClickEffects();
    expect(a.left).toMatchObject({
      springIntensity: 35,
      rippleEnabled: false,
      ...CURSOR_RING_DEFAULTS,
      water: DEFAULT_CURSOR_WATER_RIPPLE,
    });
    expect(a.left.water).not.toBe(a.right.water);
    a.left.water!.intensity = 80;
    expect(a.right.water!.intensity).toBe(25);
    expect(b.left.water!.intensity).toBe(25);
    expect(createDefaultCursorPresentation().clickEffects).toEqual(b);
  });
  it.each([undefined, null, [], 'invalid', 42])('defaults absent or malformed root %j', (value) => {
    expect(normalizeCursorClickEffects(value)).toEqual(createDefaultCursorClickEffects());
    expect(normalizeCursorWaterRipple(value)).toEqual(DEFAULT_CURSOR_WATER_RIPPLE);
  });
  it('preserves different styles, activations and water values for each button after JSON serialization', () => {
    const input = createDefaultCursorClickEffects();
    input.left = {
      ...input.left,
      rippleStyle: 'water',
      rippleEnabled: true,
      water: { intensity: 1, spread: 1, durationMs: 400, width: 1 },
    };
    input.right = {
      ...input.right,
      rippleStyle: 'solid',
      rippleEnabled: false,
      rippleOpacity: 20,
      rippleWidth: 1,
      rippleDurationMs: 1200,
    };
    expect(normalizeCursorClickEffects(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });
  it('reads older records with distinct styles and adds all optional controls without changing saved values', () => {
    const defaults = createDefaultCursorClickEffects();
    const legacy = {
      springEnabled: false,
      springIntensity: 50,
      rippleEnabled: true,
      rippleStyle: 'double',
      rippleSize: 30,
      rippleColor: '#123456',
    };
    expect(normalizeCursorClickEffect(legacy, defaults.left)).toEqual({ ...defaults.left, ...legacy });
    expect(() => validateCursorClickEffect(legacy)).not.toThrow();
  });
  it.each(Object.entries(CURSOR_CLICK_LIMITS))('bounds the %s range and defaults non-finite input', (key, range) => {
    const defaults = createDefaultCursorClickEffects();
    const ring = key.startsWith('ripple');
    const read = (value: unknown) =>
      ring ? normalizeCursorClickEffect({ [key]: value }, defaults.left) : normalizeCursorWaterRipple({ [key]: value });
    expect((read(-10000) as unknown as Record<string, number>)[key]).toBe(range.min);
    expect((read(10000) as unknown as Record<string, number>)[key]).toBe(range.max);
    for (const value of [NaN, Infinity, 'bad'])
      expect(read(value)).toEqual(ring ? defaults.left : DEFAULT_CURSOR_WATER_RIPPLE);
  });
  it('defaults invalid booleans, style and color and retains explicit none', () => {
    const { left } = createDefaultCursorClickEffects();
    expect(
      normalizeCursorClickEffect({ springEnabled: 'bad', rippleEnabled: 1, rippleStyle: 'bad', rippleColor: '' }, left),
    ).toEqual(left);
    expect(normalizeCursorClickEffect({ rippleStyle: 'none', rippleEnabled: false }, left)).toMatchObject({
      rippleStyle: 'none',
      rippleEnabled: false,
    });
    expect(normalizeCursorClickEffect(null, left)).toEqual(left);
  });
  it.each([
    null,
    [],
    {},
    { springEnabled: 1 },
    { springIntensity: NaN },
    { rippleEnabled: 'bad' },
    { rippleSize: Infinity },
    { rippleColor: '' },
    { rippleOpacity: NaN },
    { rippleWidth: '2' },
    { rippleDurationMs: null },
    { water: [] },
    { water: {} },
    { water: { ...DEFAULT_CURSOR_WATER_RIPPLE, spread: NaN } },
  ])('rejects malformed saved click record %j', (patch) => {
    const value =
      patch === null || Array.isArray(patch) ? patch : { ...createDefaultCursorClickEffects().left, ...patch };
    if (patch && !Array.isArray(patch) && Object.keys(patch).length === 0)
      expect(() => validateCursorClickEffect(patch)).toThrow();
    else expect(() => validateCursorClickEffect(value)).toThrow();
  });
});
