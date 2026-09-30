import { adjustHexBrightness, DEFAULT_APPEARANCE, hexToRgba, type AppearanceSettings } from '~/types/appearance';

export function resolveAppearanceAccent(
  appearance: Pick<AppearanceSettings, 'primaryColor' | 'activePresetId'>,
  isDark: boolean,
) {
  const isBeamPreset =
    appearance.activePresetId === DEFAULT_APPEARANCE.activePresetId &&
    appearance.primaryColor.toLowerCase() === DEFAULT_APPEARANCE.primaryColor;
  const primary = isBeamPreset && !isDark ? '#c45318' : appearance.primaryColor;
  return {
    primary,
    hover: adjustHexBrightness(primary, isDark ? 12 : -10),
    light: hexToRgba(primary, isDark ? 0.18 : isBeamPreset ? 0.07 : 0.1),
    border: hexToRgba(primary, !isDark && isBeamPreset ? 0.25 : 0.35),
  };
}
