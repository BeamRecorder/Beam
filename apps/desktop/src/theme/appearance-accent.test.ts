import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '~/types/appearance';
import { resolveAppearanceAccent } from './appearance-accent';

let stylesheet: HTMLStyleElement;
const palette = readFileSync('apps/desktop/src/theme/surfaces.css', 'utf8');

beforeEach(() => {
  stylesheet = document.createElement('style');
  stylesheet.textContent = palette;
  document.head.append(stylesheet);
});
afterEach(() => {
  stylesheet.remove();
  document.documentElement.classList.remove('dark');
});

describe('appearance accent', () => {
  it.each([DEFAULT_APPEARANCE.primaryColor, '#B85C38', '#FF5A1F', '#cf4a1d'])(
    'inherits the shared CSS palette for saved Beam orange %s',
    (primaryColor) => {
      for (const activePresetId of [null, undefined, 'custom', 'beam-sunset']) {
        const appearance = Object.freeze({ primaryColor, activePresetId });
        expect(resolveAppearanceAccent(appearance, false)).toBeNull();
        expect(resolveAppearanceAccent(appearance, true)).toBeNull();
        expect(appearance.primaryColor).toBe(primaryColor);
      }
    },
  );

  it.each([true, false])('preserves a custom color even with the Beam preset selected (dark: %s)', (isDark) => {
    const result = resolveAppearanceAccent({ ...DEFAULT_APPEARANCE, primaryColor: '#123456' }, isDark);
    expect(result).toEqual({
      primary: '#123456',
      hover: isDark ? '#315375' : '#001b3d',
      foreground: '#ffffff',
      foregroundHover: '#ffffff',
      light: `rgba(18, 52, 86, ${isDark ? 0.18 : 0.1})`,
      border: 'rgba(18, 52, 86, 0.35)',
    });
  });

  it.each([
    ['#000000', '#ffffff'],
    ['#ffffff', '#000000'],
    ['#808080', '#000000'],
  ])('chooses legible ink for custom accent %s', (primaryColor, foreground) => {
    const result = resolveAppearanceAccent({ primaryColor, activePresetId: null }, false);
    expect(result?.foreground).toBe(foreground);
    expect(result?.primary).toBe(primaryColor);
  });

  it('recomputes the foreground when a custom hover crosses from light to dark', () => {
    const result = resolveAppearanceAccent({ primaryColor: '#808080', activePresetId: null }, false);
    expect(result?.foreground).toBe('#000000');
    expect(result?.foregroundHover).toBe('#ffffff');
  });
});

describe('shared Beam CSS palette', () => {
  it.each([true, false])('pairs orange with readable white action text in both themes (dark: %s)', (isDark) => {
    document.documentElement.classList.toggle('dark', isDark);
    const style = getComputedStyle(document.documentElement);
    expect(style.getPropertyValue('--text-on-primary').trim()).toBe('#ffffff');
    expect(style.getPropertyValue('--text-on-primary-hover').trim()).toBe('#ffffff');
    expect(style.getPropertyValue('--color-primary').trim()).toBe('#cf4a1d');
    for (const token of ['--color-primary', '--color-primary-hover']) {
      const color = style.getPropertyValue(token).trim();
      const rgb = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
      const linear = rgb.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      const luminance = linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
      expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
