import { describe, expect, it } from 'vitest';
import type { CursorEvent } from '../capture/capture-session';
import { createDefaultCursorClickEffects, normalizeCursorClickEffects } from '../capture/cursor-settings';
import { DEFAULT_CURSOR_WATER_RIPPLE } from '../capture/cursor-click-schema.js';
import { cursorRippleAt } from './cursor-ripple';
import {
  cursorWaterRipplesAt,
  MAX_CURSOR_WATER_RIPPLE_DURATION_SECONDS,
  MAX_CURSOR_WATER_RIPPLES,
} from './cursor-water-ripple';

const effects = () => {
  const value = createDefaultCursorClickEffects();
  value.left = { ...value.left, rippleStyle: 'water', rippleEnabled: true };
  value.right = {
    ...value.right,
    rippleStyle: 'water',
    rippleEnabled: true,
    water: { ...DEFAULT_CURSOR_WATER_RIPPLE, spread: 60 },
  };
  return value;
};
const press = (time: number, button = 1, pressed = true): CursorEvent => ({
  event: 'button',
  sessionNs: time * 1e9,
  button,
  pressed,
  normalizedX: 0.3,
  normalizedY: 0.6,
});

describe('recorded water click waves', () => {
  it.each([1, 2, 3])('samples the real press position for button %s without movement events', (button) => {
    expect(cursorWaterRipplesAt([press(1, button)], effects(), 1.25)).toEqual([
      {
        x: 0.3,
        y: 0.6,
        ageSeconds: 0.25,
        spread: button === 2 ? 60 : 18,
        intensity: 25,
        durationSeconds: 0.9,
        width: 4,
      },
    ]);
  });
  it('includes clicks at zero and excludes future, release and unsupported button events', () => {
    expect(cursorWaterRipplesAt([press(0), press(0.1, 4), press(0.2, 1, false), press(1)], effects(), 0.3)).toEqual([
      { x: 0.3, y: 0.6, ageSeconds: 0.3, spread: 18, intensity: 25, durationSeconds: 0.9, width: 4 },
    ]);
  });
  it.each([NaN, Infinity, -Infinity, -1])('has no waves at an invalid clock %s', (time) => {
    expect(cursorWaterRipplesAt([press(0)], effects(), time)).toEqual([]);
  });
  it('expires waves at the lifetime boundary and repeats identical samples after reverse seeking', () => {
    const events = [press(1), press(1.3, 2)];
    const first = cursorWaterRipplesAt(events, effects(), 1.5);
    expect(first).toHaveLength(2);
    expect(cursorWaterRipplesAt(events, effects(), 4)).toEqual([]);
    expect(cursorWaterRipplesAt(events, effects(), 1.5)).toEqual(first);
    expect(cursorWaterRipplesAt([press(0)], effects(), 0.9)).toEqual([]);
    expect(cursorWaterRipplesAt([press(0)], effects(), MAX_CURSOR_WATER_RIPPLE_DURATION_SECONDS)).toEqual([]);
  });
  it('uses independent lifetimes and omits zero-intensity waves', () => {
    const value = effects();
    value.left.water = { ...DEFAULT_CURSOR_WATER_RIPPLE, durationMs: 400 };
    value.right.water = { ...DEFAULT_CURSOR_WATER_RIPPLE, durationMs: 2400 };
    expect(cursorWaterRipplesAt([press(0), press(0, 2)], value, 1)).toHaveLength(1);
    expect(cursorWaterRipplesAt([press(0, 2)], value, 2.39)).toHaveLength(1);
    expect(cursorWaterRipplesAt([press(0, 2)], value, 2.4)).toEqual([]);
    value.right.water.intensity = 0;
    expect(cursorWaterRipplesAt([press(0, 2)], value, 0.1)).toEqual([]);
  });
  it('respects independent button activation and legacy styles', () => {
    const value = effects();
    value.right.rippleEnabled = false;
    expect(cursorWaterRipplesAt([press(0, 2)], value, 0.2)).toEqual([]);
    value.left.rippleStyle = 'double';
    expect(cursorWaterRipplesAt([press(0)], value, 0.2)).toEqual([]);
    expect(cursorWaterRipplesAt([], effects(), 0.2)).toEqual([]);
  });
  it('bounds simultaneous waves to the latest eight eligible presses, including unordered captures', () => {
    const events = Array.from({ length: 20 }, (_, i) => press(i * 0.01)).reverse();
    const result = cursorWaterRipplesAt(events, effects(), 0.3);
    expect(result).toHaveLength(MAX_CURSOR_WATER_RIPPLES);
    expect(result[0]!.ageSeconds).toBeCloseTo(0.18);
    expect(result.at(-1)!.ageSeconds).toBeCloseTo(0.11);
  });
  it.each([NaN, Infinity, -0.01, 1.01])('rejects invalid click coordinates %s', (coordinate) => {
    const event = { ...press(0), normalizedX: coordinate, normalizedY: coordinate } as CursorEvent;
    expect(cursorWaterRipplesAt([event], effects(), 0.2)).toEqual([]);
  });
  it.each(['left', 'right'] as const)(
    'normalizes a saved water preset on %s without enabling inactive buttons',
    (button) => {
      const value = createDefaultCursorClickEffects();
      value[button].rippleStyle = 'water';
      if (button === 'right') value.left.rippleStyle = 'none';
      expect(normalizeCursorClickEffects(value)).toEqual(value);
    },
  );
  it.each([0, 0.25, 0.5])('does not paint a superficial ring for water at %ss', (age) => {
    expect(cursorRippleAt(age, 30, 'water')).toBeNull();
  });
});
