import { adjustHexBrightness, DEFAULT_APPEARANCE, hexToRgba, type AppearanceSettings } from '~/types/appearance';

export function resolveAppearanceAccent(
  appearance: Pick<AppearanceSettings, 'primaryColor' | 'activePresetId'>,
  isDark: boolean,
) {
  // The shared CSS palette owns Beam orange, including saved legacy shades.
  // Only custom colors need inline overrides. Radius edits can clear the preset ID.
  const selectedColor = appearance.primaryColor.toLowerCase();
  if ([DEFAULT_APPEARANCE.primaryColor, '#ff5a1f', '#cf4a1d'].includes(selectedColor)) return null;
  const primary = appearance.primaryColor;
  const hover = adjustHexBrightness(primary, isDark ? 12 : -10);
  const foregroundFor = (color: string) => {
    const rgb = parseInt(color.slice(1), 16);
    const channels = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
  };
  return {
    primary,
    hover,
    foreground: foregroundFor(primary),
    foregroundHover: foregroundFor(hover),
    light: hexToRgba(primary, isDark ? 0.18 : 0.1),
    border: hexToRgba(primary, 0.35),
  };
}
