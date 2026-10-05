import { describe, expect, it } from 'vitest';
import { frameOptions, animatedFrameOptions, FRAME_MODELS } from '../frame-options';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('framing thumbnail menus', () => {
  it('offers all models with translated animation labels and actual thumbnail files', () => {
    const options = frameOptions('Bordure animée');
    expect(options.map((option) => option.value)).toEqual(FRAME_MODELS);
    expect(options[2]!.label).toBe('Bordure animée');
    for (const option of options) {
      expect(option.thumbnail).toMatch(/\/frame-previews\/[^/]+\.png$/);
      expect(existsSync(resolve('public/frame-previews', `${option.value}.png`))).toBe(true);
    }
  });
  it('offers five independently translated presets with real render previews', () => {
    const options = animatedFrameOptions((key) => `localized ${key}`);
    expect(options).toHaveLength(5);
    for (const option of options) {
      expect(option.label).toBe(`localized ${option.value}`);
      expect(existsSync(resolve('public/frame-previews', `${option.value}.png`))).toBe(true);
    }
  });
  it('creates fresh menu records when the locale changes without changing their values', () => {
    const a = frameOptions('Animated border'),
      b = frameOptions('Bordure animée');
    expect(a[2]!.value).toBe(b[2]!.value);
    expect(a[2]).not.toBe(b[2]);
    expect(a[2]!.thumbnail).toBe(b[2]!.thumbnail);
    expect(a[2]!.label).not.toBe(b[2]!.label);
  });
});
