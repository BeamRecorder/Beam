import type { ScreenRegion, ScreenRegionBounds } from '../../../api/types/screen-region';

export interface ScreenRegionPresetOption {
  value: string;
  label: string;
  width: number;
  height: number;
}

export const SCREEN_REGION_PRESETS: ScreenRegionPresetOption[] = [
  { value: '640x480', label: '640 × 480', width: 640, height: 480 },
  { value: '800x600', label: '800 × 600', width: 800, height: 600 },
  { value: '1024x768', label: '1024 × 768', width: 1024, height: 768 },
  { value: '1366x768', label: '1366 × 768', width: 1366, height: 768 },
  { value: '1440x990', label: '1440 × 990', width: 1440, height: 990 },
  { value: '1920x1080', label: '1920 × 1080', width: 1920, height: 1080 },
];

export function findMatchingPreset(
  region: ScreenRegion | null,
  bounds: ScreenRegionBounds,
  tolerance = 2,
): string | null {
  if (!region) return null;
  const currentW = Math.round(region.width * Math.max(1, bounds.width));
  const currentH = Math.round(region.height * Math.max(1, bounds.height));
  const matched = SCREEN_REGION_PRESETS.find(
    (p) => Math.abs(p.width - currentW) <= tolerance && Math.abs(p.height - currentH) <= tolerance,
  );
  return matched ? matched.value : null;
}

export function computePresetRegion(
  presetValue: string,
  bounds: ScreenRegionBounds,
  currentRegion: ScreenRegion | null,
  isFullScreen: boolean,
): ScreenRegion | null {
  const preset = SCREEN_REGION_PRESETS.find((p) => p.value === presetValue);
  if (!preset) return null;

  const boundsWidth = Math.max(1, bounds.width);
  const boundsHeight = Math.max(1, bounds.height);

  const targetWidth = Math.min(1, preset.width / boundsWidth);
  const targetHeight = Math.min(1, preset.height / boundsHeight);

  let centerX = 0.5;
  let centerY = 0.5;
  if (currentRegion && !isFullScreen) {
    centerX = currentRegion.x + currentRegion.width / 2;
    centerY = currentRegion.y + currentRegion.height / 2;
  }

  const x = Math.max(0, Math.min(1 - targetWidth, centerX - targetWidth / 2));
  const y = Math.max(0, Math.min(1 - targetHeight, centerY - targetHeight / 2));

  return { x, y, width: targetWidth, height: targetHeight };
}
