import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '~/types/appearance';
import { resolveAppearanceAccent } from './appearance-accent';

describe('appearance accent', () => {
  it('uses a muted orange and white text for the light Beam palette', () => {
    expect(resolveAppearanceAccent(DEFAULT_APPEARANCE, false)).toEqual({
      primary: '#ac5938',
      hover: '#93401f',
      foreground: '#ffffff',
      foregroundHover: '#ffffff',
      light: 'rgba(172, 89, 56, 0.07)',
      border: 'rgba(172, 89, 56, 0.25)',
    });
  });

  it('pairs the muted dark orange with dark ink and a brighter hover', () => {
    expect(resolveAppearanceAccent(DEFAULT_APPEARANCE, true)).toEqual({
      primary: '#c07a58',
      hover: '#df9977',
      foreground: '#000000',
      foregroundHover: '#000000',
      light: 'rgba(192, 122, 88, 0.18)',
      border: 'rgba(192, 122, 88, 0.35)',
    });
  });

  it('recognizes a saved uppercase Beam shade', () => {
    expect(resolveAppearanceAccent({ ...DEFAULT_APPEARANCE, primaryColor: '#B85C38' }, false).primary).toBe('#ac5938');
  });

  it.each([null, undefined, 'custom', 'cyber-violet'])('preserves the same color with preset %s', (activePresetId) => {
    const appearance = { ...DEFAULT_APPEARANCE, activePresetId };
    expect(resolveAppearanceAccent(appearance, false)).toEqual({
      primary: '#b85c38',
      hover: '#9f431f',
      foreground: '#000000',
      foregroundHover: '#ffffff',
      light: 'rgba(184, 92, 56, 0.1)',
      border: 'rgba(184, 92, 56, 0.35)',
    });
  });

  it.each([true, false])('preserves a custom color even with the Beam preset selected (dark: %s)', (isDark) => {
    const appearance = { ...DEFAULT_APPEARANCE, primaryColor: '#123456' };
    const result = resolveAppearanceAccent(appearance, isDark);
    expect(result.primary).toBe('#123456');
    expect(result.hover).toBe(isDark ? '#315375' : '#001b3d');
    expect(result.light).toBe(`rgba(18, 52, 86, ${isDark ? 0.18 : 0.1})`);
    expect(result.border).toBe('rgba(18, 52, 86, 0.35)');
  });

  it.each([
    ['#000000', '#ffffff'],
    ['#ffffff', '#000000'],
    ['#808080', '#000000'],
  ])('chooses legible ink for custom accent %s', (primaryColor, foreground) => {
    const result = resolveAppearanceAccent({ primaryColor, activePresetId: null }, false);
    expect(result.foreground).toBe(foreground);
    expect(result.primary).toBe(primaryColor);
  });

  it('recomputes the foreground when a custom hover crosses from light to dark', () => {
    const result = resolveAppearanceAccent({ primaryColor: '#808080', activePresetId: null }, false);
    expect(result.foreground).toBe('#000000');
    expect(result.foregroundHover).toBe('#ffffff');
  });

  it('does not mutate the persisted selection when resolving a different theme', () => {
    const appearance = Object.freeze({ ...DEFAULT_APPEARANCE });
    resolveAppearanceAccent(appearance, false);
    resolveAppearanceAccent(appearance, true);
    expect(appearance.primaryColor).toBe('#b85c38');
  });
});
