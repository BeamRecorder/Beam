import { describe, expect, it } from 'vitest';
import {
  BRAND_JINGLES,
  BRAND_JINGLE_SECONDS,
  RESTING_WORDMARK,
  blendBrandLetters,
  chooseBrandJingle,
  sampleBrandJingle,
} from './brand-motion';

describe('brand wordmark motion', () => {
  it.each(BRAND_JINGLES)('samples %s deterministically and restores simple Beam text', (jingle) => {
    expect(sampleBrandJingle(jingle, 0.37)).toEqual(sampleBrandJingle(jingle, 0.37));
    expect(sampleBrandJingle(jingle, 0.37)).not.toEqual(RESTING_WORDMARK);
    expect(sampleBrandJingle(jingle, 0)).toEqual(RESTING_WORDMARK);
    expect(sampleBrandJingle(jingle, BRAND_JINGLE_SECONDS)).toEqual(RESTING_WORDMARK);
    for (let time = 0; time < BRAND_JINGLE_SECONDS; time += 0.1) {
      const letters = sampleBrandJingle(jingle, time);
      expect(letters).toHaveLength(4);
      expect(JSON.stringify(letters)).not.toMatch(/NaN|Infinity/);
    }
  });
  it('offers twelve distinct generic effects', () => {
    expect(new Set(BRAND_JINGLES.map((jingle) => JSON.stringify(sampleBrandJingle(jingle, 0.37)))).size).toBe(12);
  });
  it.each([-1, NaN, Infinity, -Infinity, 100])('keeps invalid or completed time %s at rest', (time) => {
    expect(sampleBrandJingle('decode', time)).toEqual(RESTING_WORDMARK);
  });
  it.each(BRAND_JINGLES)('does not immediately repeat %s when choosing a random effect', (previous) => {
    for (const random of [0, 0.3, 0.999]) expect(chooseBrandJingle(previous, () => random)).not.toBe(previous);
  });
  it('can independently choose every effect on an initial interaction', () => {
    expect(BRAND_JINGLES.map((_, index) => chooseBrandJingle(null, () => (index + 0.1) / 12))).toEqual(BRAND_JINGLES);
  });
  it('morphs current parameters instead of starting another overlay', () => {
    const from = sampleBrandJingle('crash', 0.4);
    const to = sampleBrandJingle('shimmer', 0.8);
    expect(blendBrandLetters(from, to, 0)).toEqual(from);
    expect(blendBrandLetters(from, to, 1)).toEqual(to);
    expect(blendBrandLetters(from, to, 0.5)).not.toEqual(from);
    expect(blendBrandLetters(from, to, 0.5)).not.toEqual(to);
  });
});
