import { expect, it } from 'vitest';
import {
  DEFAULT_ORBIT_SETTINGS,
  ORBIT_SETTING_LIMITS,
  ORBIT_PRESETS,
  normalizeOrbitSettings,
  validateOrbitSettings,
  activeOrbitPreset,
  applyOrbitPreset,
  interpolateOrbitSettings,
  orbitSettingsForZoom,
} from '../orbit-settings';
import { createManualZoom, manualCameraZoom } from '../manual-zoom';
import { orbitCameraPose, orbitCameraCoverScale } from '../orbit-camera';
import { projectPerspectivePoint, unprojectPerspectivePoint } from '../perspective-projection';
import { createCompositionCameraEvaluator } from '../composition-camera';
import { createCameraMotionBlurPlan } from '../zoom-motion-blur';
import type { OrbitCameraSettings } from '../orbit-camera-types';

it('returns owned defaults and clamps every invalid or extreme field', () => {
  expect(normalizeOrbitSettings()).toEqual(DEFAULT_ORBIT_SETTINGS);
  expect(normalizeOrbitSettings()).not.toBe(DEFAULT_ORBIT_SETTINGS);
  for (const key of Object.keys(ORBIT_SETTING_LIMITS) as (keyof OrbitCameraSettings)[]) {
    const [min, max] = ORBIT_SETTING_LIMITS[key];
    expect(normalizeOrbitSettings({ [key]: -1e20 })[key]).toBe(min);
    expect(normalizeOrbitSettings({ [key]: 1e20 })[key]).toBe(max);
    for (const bad of [NaN, Infinity, -Infinity, '9', null])
      expect(normalizeOrbitSettings({ [key]: bad } as Partial<OrbitCameraSettings>)[key]).toBe(
        DEFAULT_ORBIT_SETTINGS[key],
      );
  }
});
it.each([null, [], 0, 'a', {}, { ...DEFAULT_ORBIT_SETTINGS, unknown: 1 }])(
  'rejects malformed persisted settings %j',
  (value) => {
    expect(() => validateOrbitSettings(value)).toThrow('Invalid orbit');
  },
);
it('validates every field boundary and rejects missing, nonfinite or out-of-range settings', () => {
  for (const key of Object.keys(ORBIT_SETTING_LIMITS) as (keyof OrbitCameraSettings)[]) {
    const [min, max] = ORBIT_SETTING_LIMITS[key];
    for (const value of [min, max])
      expect(() => validateOrbitSettings({ ...DEFAULT_ORBIT_SETTINGS, [key]: value })).not.toThrow();
    for (const value of [min - 0.0001, max + 0.0001, Infinity, NaN, '1', null, undefined])
      expect(() => validateOrbitSettings({ ...DEFAULT_ORBIT_SETTINGS, [key]: value })).toThrow();
  }
});
it.each(ORBIT_PRESETS)('owns valid $id settings and recognizes Custom without mutating the preset', (preset) => {
  validateOrbitSettings(preset.settings);
  expect(activeOrbitPreset(preset.settings)).toBe(preset.id);
  const original = createManualZoom('still', 0, 1),
    applied = applyOrbitPreset(original, preset);
  expect(applied.orbitSettings).toEqual(preset.settings);
  expect(applied.orbitSettings).not.toBe(preset.settings);
  expect(applied.transition).toBeUndefined();
  expect(applyOrbitPreset({ ...original, endMs: 5000 }, preset).transition).toBe('cinematic');
  expect(activeOrbitPreset({ ...preset.settings, roll: 1.234 })).toBe('custom');
});
it('preserves defaults and deliberately converts legacy axis controls only when editing', () => {
  expect(activeOrbitPreset()).toBe('balanced');
  expect(orbitSettingsForZoom(createManualZoom('flat', 0, 1000))).toEqual(DEFAULT_ORBIT_SETTINGS);
  expect(orbitSettingsForZoom({ ...createManualZoom('old', 0, 1000), projection: '3d' })).toMatchObject({
    yaw: 14.3,
    pitch: -5.6,
    horizontal: 0,
    vertical: 0,
  });
  expect(
    orbitSettingsForZoom({
      ...createManualZoom('old', 0, 1000),
      projection: '3d',
      tiltHorizontal: -1,
      tiltVertical: 1,
    }),
  ).toMatchObject({ yaw: -22, pitch: 16 });
});
it('interpolates all camera parameters across connected shots with bounded progress', () => {
  const a = ORBIT_PRESETS[0]!.settings,
    b = ORBIT_PRESETS.at(-1)!.settings;
  expect(interpolateOrbitSettings(a, b, -2)).toEqual(a);
  expect(interpolateOrbitSettings(a, b, 2)).toEqual(b);
  const middle = interpolateOrbitSettings(a, b, 0.5);
  for (const key of Object.keys(a) as (keyof OrbitCameraSettings)[])
    expect(middle[key]).toBeCloseTo((a[key] + b[key]) / 2, 12);
  expect(interpolateOrbitSettings(undefined, undefined, 0.5)).toEqual(DEFAULT_ORBIT_SETTINGS);
});
it('keeps manual focus independent from orientation, FOV and roll', () => {
  const settings = {
    ...DEFAULT_ORBIT_SETTINGS,
    yaw: -25,
    pitch: 20,
    roll: 15,
    fieldOfView: 60,
    dolly: 0,
    pullback: 0.4,
  };
  const zoom = {
    ...createManualZoom('fixed', 0, 5000),
    projection: 'orbit' as const,
    tiltIntensity: 1,
    orbitSettings: settings,
  };
  const a = manualCameraZoom({ ...zoom, focus: { cx: 0, cy: 1 } }),
    b = manualCameraZoom({ ...zoom, focus: { cx: 1, cy: 0 } });
  expect(a.orbit).toEqual(b.orbit);
  expect(a.focus).not.toEqual(b.focus);
  expect(a.orbit).toMatchObject({
    azimuth: (-25 * Math.PI) / 180,
    elevation: (20 * Math.PI) / 180,
    roll: (15 * Math.PI) / 180,
    pullback: 0.4,
  });
  expect(a.orbit!.distance).toBeCloseTo(1 / Math.tan(Math.PI / 6), 12);
});
it('passes settings through playback, connected pans and per-shutter camera samples', () => {
  const a = applyOrbitPreset({ ...createManualZoom('a', 3000, 6000), mode: 'auto' }, ORBIT_PRESETS[2]!);
  const b = applyOrbitPreset({ ...createManualZoom('b', 6500, 10000), mode: 'auto' }, ORBIT_PRESETS[7]!);
  const camera = createCompositionCameraEvaluator({
    zooms: [a, b],
    telemetry: [
      { timeMs: 0, cx: 0.2, cy: 0.8 },
      { timeMs: 10000, cx: 0.9, cy: 0.1 },
    ],
  });
  const first = camera.sample(5000);
  expect(first.orbit!.roll).toBeCloseTo((-1 * Math.PI) / 180, 12);
  expect(camera.sample(8000).orbit!.pullback).toBe(0.5);
  const blend = camera.sample(6500);
  expect(blend.orbit!.roll).toBeLessThan(first.orbit!.roll!);
  const samples = createCameraMotionBlurPlan({
    sampleAt: (t) => camera.sample(t),
    timeMs: 6500,
    intensity: 1,
    sampleCount: 5,
    viewportWidth: 3840,
    viewportHeight: 2160,
  });
  expect(samples).toHaveLength(5);
  expect(samples.every((s) => s.camera.orbit!.roll! < 0 && s.camera.orbit!.pullback! > 0)).toBe(true);
  expect(new Set(samples.map((s) => s.camera.orbit!.roll)).size).toBe(5);
});
it.each([0.3, 1, 16 / 9, 32 / 9, 100])('keeps every preset finite and invertible on aspect %s', (aspect) => {
  const bounds = { x: 10, y: 20, width: 1000 * aspect, height: 1000 };
  for (const preset of ORBIT_PRESETS)
    for (const weight of [0, 0.0001, 0.1, 0.5, 1])
      for (const cx of [0, 0.5, 1]) {
        const orbit = orbitCameraPose({
          timeMs: 5000,
          weight,
          intensity: 1,
          scale: 4,
          settings: preset.settings,
          pointAt: () => ({ cx, cy: 1 - cx }),
        });
        const scale = orbitCameraCoverScale(aspect, orbit);
        expect(scale).toBeGreaterThan(0);
        expect(Number.isFinite(scale)).toBe(true);
        const transform = { tiltX: 0, tiltY: 0, orbit };
        for (const x of [0, 0.5, 1])
          for (const y of [0, 0.5, 1]) {
            const point = { x: bounds.x + x * bounds.width, y: bounds.y + y * bounds.height };
            const projected = projectPerspectivePoint(point, bounds, transform, scale);
            const restored = unprojectPerspectivePoint(projected, bounds, transform, scale);
            expect(restored.x).toBeCloseTo(point.x, 5);
            expect(restored.y).toBeCloseTo(point.y, 5);
          }
      }
});
it('makes a large pullback visibly smaller with continuous slider behavior and constant follow framing', () => {
  const base = {
    timeMs: 5000,
    weight: 1,
    intensity: 1,
    scale: 1,
    settings: ORBIT_PRESETS[7]!.settings,
    pointAt: () => ({ cx: 0.1, cy: 0.8 }),
  };
  const large = orbitCameraCoverScale(16 / 9, orbitCameraPose(base));
  expect(large).toBeLessThan(0.5);
  expect(orbitCameraCoverScale(16 / 9, orbitCameraPose({ ...base, pointAt: () => ({ cx: 0.9, cy: 0.2 }) }))).toBe(
    large,
  );
  const a = orbitCameraCoverScale(16 / 9, orbitCameraPose({ ...base, settings: { ...base.settings, pullback: 0 } }));
  const b = orbitCameraCoverScale(
    16 / 9,
    orbitCameraPose({ ...base, settings: { ...base.settings, pullback: 0.000001 } }),
  );
  expect(b / a).toBeCloseTo(1 - 0.000001, 12);
  expect(orbitCameraCoverScale(16 / 9, orbitCameraPose({ ...base, weight: 0 }))).toBe(1);
});
