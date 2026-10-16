import { DEFAULT_ORBIT_SETTINGS as defaults, ORBIT_SETTING_LIMITS } from './orbit-schema.js';
import type { OrbitCameraSettings, OrbitPresetDefinition } from './orbit-camera-types';
import type { ZoomElement } from './zoom-types';
export { validateOrbitSettings } from './orbit-schema.js';
export { ORBIT_SETTING_LIMITS } from './orbit-schema.js';
export const DEFAULT_ORBIT_SETTINGS: Readonly<OrbitCameraSettings> = defaults;
export function normalizeOrbitSettings(value?: Partial<OrbitCameraSettings>): OrbitCameraSettings {
  return Object.fromEntries(
    Object.entries(ORBIT_SETTING_LIMITS).map(([key, [min, max]]) => {
      const field = key as keyof OrbitCameraSettings,
        input = value?.[field];
      return [
        key,
        typeof input === 'number' && Number.isFinite(input) ? Math.max(min!, Math.min(max!, input)) : defaults[field],
      ];
    }),
  ) as unknown as OrbitCameraSettings;
}
export const ORBIT_PRESETS: readonly OrbitPresetDefinition[] = [
  {
    id: 'subtle',
    labelKey: 'orbitSubtle',
    settings: {
      ...defaults,
      pitch: 2,
      horizontal: 10,
      vertical: 5,
      fieldOfView: 28,
      dolly: 0.25,
      responseMs: 650,
      leadMs: 60,
    },
  },
  { id: 'balanced', labelKey: 'orbitBalanced', settings: { ...defaults } },
  {
    id: 'dynamic',
    labelKey: 'orbitDynamic',
    settings: {
      ...defaults,
      pitch: 4,
      roll: -1,
      horizontal: 22,
      vertical: 8,
      fieldOfView: 32,
      dolly: 0.35,
      responseMs: 300,
      leadMs: 80,
    },
  },
  {
    id: 'isometric',
    labelKey: 'orbitIsometric',
    settings: { ...defaults, yaw: -25, pitch: 20, horizontal: 0, vertical: 0, fieldOfView: 30 },
  },
  { id: 'left', labelKey: 'orbitLeft', settings: { ...defaults, yaw: -22, pitch: 8, horizontal: 0, vertical: 0 } },
  { id: 'right', labelKey: 'orbitRight', settings: { ...defaults, yaw: 22, pitch: 8, horizontal: 0, vertical: 0 } },
  {
    id: 'pullback',
    labelKey: 'orbitPullback',
    settings: {
      ...defaults,
      yaw: -18,
      pitch: 14,
      roll: -3,
      horizontal: 10,
      vertical: 6,
      pullback: 0.28,
      fieldOfView: 38,
      dolly: 0,
    },
  },
  {
    id: 'pullback-large',
    labelKey: 'orbitPullbackLarge',
    settings: {
      ...defaults,
      yaw: -28,
      pitch: 23,
      roll: -6,
      horizontal: 6,
      vertical: 4,
      pullback: 0.5,
      fieldOfView: 46,
      dolly: 0,
      responseMs: 700,
    },
  },
];
export function activeOrbitPreset(settings?: OrbitCameraSettings): OrbitPresetDefinition['id'] | 'custom' {
  const normalized = normalizeOrbitSettings(settings);
  return (
    ORBIT_PRESETS.find((p) =>
      Object.keys(normalized).every(
        (key) =>
          Math.abs(normalized[key as keyof OrbitCameraSettings] - p.settings[key as keyof OrbitCameraSettings]) < 1e-6,
      ),
    )?.id ?? 'custom'
  );
}
export function applyOrbitPreset(zoom: ZoomElement, preset: OrbitPresetDefinition): ZoomElement {
  return {
    ...zoom,
    projection: 'orbit',
    orbitSettings: { ...preset.settings },
    tiltIntensity: 1,
    ...(zoom.endMs > 1 ? { transition: 'cinematic' as const } : {}),
  };
}
export function interpolateOrbitSettings(
  a: OrbitCameraSettings | undefined,
  b: OrbitCameraSettings | undefined,
  t: number,
): OrbitCameraSettings {
  const from = normalizeOrbitSettings(a),
    to = normalizeOrbitSettings(b),
    progress = Math.max(0, Math.min(1, t));
  return Object.fromEntries(
    Object.keys(from).map((key) => {
      const field = key as keyof OrbitCameraSettings;
      return [field, from[field] + (to[field] - from[field]) * progress];
    }),
  ) as unknown as OrbitCameraSettings;
}
/** Editing a legacy tilt is an explicit conversion; merely opening it preserves its projection. */
export function orbitSettingsForZoom(zoom: ZoomElement): OrbitCameraSettings {
  if (zoom.projection !== '3d') return normalizeOrbitSettings(zoom.orbitSettings);
  return normalizeOrbitSettings({
    yaw: (zoom.tiltHorizontal ?? 0.65) * 22,
    pitch: (zoom.tiltVertical ?? -0.35) * 16,
    horizontal: 0,
    vertical: 0,
  });
}
