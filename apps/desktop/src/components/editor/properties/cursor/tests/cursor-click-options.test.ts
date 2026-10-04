import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLICK_RIPPLE_PRESETS, cursorClickOptions } from '../cursor-click-options';

describe('illustrated cursor click choices', () => {
  it('offers real rendered PNGs for every click preset', () => {
    const options = cursorClickOptions((key) => key);
    expect(options.map((option) => option.value)).toEqual(CLICK_RIPPLE_PRESETS);
    for (const option of options) {
      expect(option.thumbnail).toMatch(/\/click-previews\/[^/]+\.png$/);
      const file = resolve('public/click-previews', `${option.value}.png`);
      expect(existsSync(file)).toBe(true);
      const bytes = readFileSync(file);
      expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(bytes.readUInt32BE(16)).toBe(240);
      expect(bytes.readUInt32BE(20)).toBe(150);
    }
  });
  it('translates the labels independently from the persisted style', () => {
    expect(cursorClickOptions((key) => `local ${key}`).map((option) => option.label)).toEqual([
      'local presetSingle',
      'local presetDouble',
      'local presetSolid',
      'local presetWater',
    ]);
  });
  it('creates fresh choices for locale updates with stable thumbnails and values', () => {
    const a = cursorClickOptions((key) => key),
      b = cursorClickOptions((key) => `new ${key}`);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0]!.thumbnail).toBe(b[0]!.thumbnail);
    expect(a[0]!.value).toBe(b[0]!.value);
    expect(a[0]!.label).not.toBe(b[0]!.label);
    expect(new Set(a.map((option) => option.thumbnail)).size).toBe(4);
  });
});
