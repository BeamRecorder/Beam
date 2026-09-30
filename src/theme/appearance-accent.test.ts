import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '~/types/appearance';
import { resolveAppearanceAccent } from './appearance-accent';

describe('appearance accent', () => {
  it('uses a clearer orange with subtle light-theme fills and borders for Beam Sunset', () => {
    expect(resolveAppearanceAccent(DEFAULT_APPEARANCE, false)).toEqual({
      primary: '#c45318',
      hover: '#ab3a00',
      light: 'rgba(196, 83, 24, 0.07)',
      border: 'rgba(196, 83, 24, 0.25)',
    });
  });

  it('keeps the existing dark shade and its stronger accent fill', () => {
    expect(resolveAppearanceAccent(DEFAULT_APPEARANCE, true)).toEqual({
      primary: '#b85c38',
      hover: '#d77b57',
      light: 'rgba(184, 92, 56, 0.18)',
      border: 'rgba(184, 92, 56, 0.35)',
    });
  });

  it('recognizes a saved uppercase Beam shade', () => {
    expect(resolveAppearanceAccent({ ...DEFAULT_APPEARANCE, primaryColor: '#B85C38' }, false).primary).toBe('#c45318');
  });

  it.each([null, undefined, 'custom', 'cyber-violet'])('preserves the same color with preset %s', (activePresetId) => {
    const appearance = { ...DEFAULT_APPEARANCE, activePresetId };
    expect(resolveAppearanceAccent(appearance, false)).toEqual({
      primary: '#b85c38',
      hover: '#9f431f',
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

  it('does not mutate the persisted selection when resolving a different theme', () => {
    const appearance = Object.freeze({ ...DEFAULT_APPEARANCE });
    resolveAppearanceAccent(appearance, false);
    resolveAppearanceAccent(appearance, true);
    expect(appearance.primaryColor).toBe('#b85c38');
  });
});
