// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  normalizeRecordlyZoom,
  applyRecordlyZoomPreset,
  recordlyZoomPreset,
  cameraZoomsBackground,
} from './recordly-settings';
import { RECORDLY_ZOOM_DEFAULTS } from './recordly-settings-schema.js';
import { normalizeZoomAutoFollow, DEFAULT_ZOOM_AUTO_FOLLOW } from './zoom-types';
import { CURSOR_MOTION_PRESETS } from './recordly/cursorMotionPresets';
import { DEFAULT_ZOOM_MOTION_BLUR_TUNING } from './recordly/types';

describe('pinned camera settings at the project boundary', () => {
  it.each([undefined, null, [], false, 'settings', {}])(
    'uses actual upstream defaults for invalid/missing %j',
    (value) => {
      const result = normalizeRecordlyZoom(value);
      expect(result).toEqual(RECORDLY_ZOOM_DEFAULTS);
      expect(result.zoomMotionBlurTuning).toEqual(DEFAULT_ZOOM_MOTION_BLUR_TUNING);
      expect(result).not.toBe(RECORDLY_ZOOM_DEFAULTS);
      expect(result.zoomMotionBlurTuning).not.toBe(RECORDLY_ZOOM_DEFAULTS.zoomMotionBlurTuning);
    },
  );
  it.each([
    'zoomInDurationMs',
    'zoomOutDurationMs',
    'zoomSmoothness',
    'zoomClassicMode',
    'connectZooms',
    'connectedZoomGapMs',
    'connectedZoomDurationMs',
    'cameraSpringStiffnessMultiplier',
    'cameraSpringDampingMultiplier',
    'cameraSpringMassMultiplier',
    'defaultDurationMs',
    'zoomMotionBlur',
    'loopCursor',
  ] as const)('rejects invalid %s without changing other defaults', (key) => {
    for (const value of [null, {}, '1', NaN, Infinity, -Infinity])
      expect(normalizeRecordlyZoom({ [key]: value })).toEqual(RECORDLY_ZOOM_DEFAULTS);
  });
  it('bounds all custom numeric controls and rejects malformed blur tuning', () => {
    const low = normalizeRecordlyZoom({
      zoomInDurationMs: -1,
      zoomOutDurationMs: 0,
      zoomSmoothness: -2,
      connectedZoomGapMs: -1,
      connectedZoomDurationMs: -3,
      cameraSpringStiffnessMultiplier: 0,
      cameraSpringDampingMultiplier: 0,
      cameraSpringMassMultiplier: 0,
      defaultDurationMs: -5,
      zoomMotionBlur: -1,
      zoomMotionBlurTuning: [],
    });
    expect(low).toMatchObject({
      zoomInDurationMs: 60,
      zoomOutDurationMs: 60,
      zoomSmoothness: 0,
      connectedZoomGapMs: 0,
      connectedZoomDurationMs: 60,
      cameraSpringStiffnessMultiplier: 0.25,
      cameraSpringDampingMultiplier: 0.25,
      cameraSpringMassMultiplier: 0.25,
      defaultDurationMs: 1,
      zoomMotionBlur: 0,
      zoomMotionBlurTuning: DEFAULT_ZOOM_MOTION_BLUR_TUNING,
    });
    const high = normalizeRecordlyZoom({
      zoomInDurationMs: 9000,
      zoomOutDurationMs: 9000,
      zoomSmoothness: 2,
      connectedZoomGapMs: 9000,
      connectedZoomDurationMs: 9000,
      cameraSpringStiffnessMultiplier: 6,
      cameraSpringDampingMultiplier: 6,
      cameraSpringMassMultiplier: 6,
      zoomMotionBlur: 4,
    });
    expect(high).toMatchObject({
      zoomInDurationMs: 4000,
      zoomOutDurationMs: 4000,
      zoomSmoothness: 1,
      connectedZoomGapMs: 5000,
      connectedZoomDurationMs: 4000,
      cameraSpringStiffnessMultiplier: 3,
      cameraSpringDampingMultiplier: 3,
      cameraSpringMassMultiplier: 3,
      zoomMotionBlur: 2,
    });
  });
  it.each(Object.keys(DEFAULT_ZOOM_MOTION_BLUR_TUNING) as (keyof typeof DEFAULT_ZOOM_MOTION_BLUR_TUNING)[])(
    'normalizes blur parameter %s independently',
    (key) => {
      expect(normalizeRecordlyZoom({ zoomMotionBlurTuning: { [key]: NaN } }).zoomMotionBlurTuning).toEqual(
        DEFAULT_ZOOM_MOTION_BLUR_TUNING,
      );
      expect(
        normalizeRecordlyZoom({ zoomMotionBlurTuning: { [key]: -100 } }).zoomMotionBlurTuning[key],
      ).toBeGreaterThanOrEqual(0);
      expect(normalizeRecordlyZoom({ zoomMotionBlurTuning: { [key]: 1e10 } }).zoomMotionBlurTuning[key]).toBeLessThan(
        1000,
      );
    },
  );
  it.each(['focused', 'smooth'] as const)('applies only upstream ZoomSettings fields for %s', (id) => {
    const input = normalizeRecordlyZoom({
      zoomClassicMode: true,
      zoomSmoothness: 0.8,
      connectZooms: false,
      zoomMotionBlur: 1.1,
    });
    const copy = structuredClone(input),
      next = applyRecordlyZoomPreset(input, id),
      preset = CURSOR_MOTION_PRESETS[id];
    expect(next).toEqual({
      ...input,
      zoomInDurationMs: preset.zoomInDurationMs,
      zoomOutDurationMs: preset.zoomOutDurationMs,
      zoomClassicMode: false,
    });
    expect(recordlyZoomPreset(next)).toBe(id);
    expect(input).toEqual(copy);
  });
  it('does not label custom durations or Classic as an active preset', () => {
    expect(recordlyZoomPreset(normalizeRecordlyZoom({ zoomInDurationMs: 201 }))).toBeNull();
    expect(recordlyZoomPreset(normalizeRecordlyZoom({ zoomOutDurationMs: 286 }))).toBeNull();
    expect(recordlyZoomPreset(normalizeRecordlyZoom({ zoomClassicMode: true }))).toBeNull();
  });
  it.each([false, true])(
    'retains an explicit background choice=%s independently of the experimental switch',
    (zoomBackground) => {
      for (const experimentalZoom of [false, true]) {
        const value = normalizeZoomAutoFollow({
          ...DEFAULT_ZOOM_AUTO_FOLLOW,
          zoomBackground,
          experimentalZoom,
          recordly: normalizeRecordlyZoom({ loopCursor: true }),
        });
        expect(cameraZoomsBackground(value)).toBe(zoomBackground);
        expect(value.recordly?.loopCursor).toBe(true);
        expect(normalizeZoomAutoFollow(JSON.parse(JSON.stringify(value)))).toEqual(value);
      }
    },
  );
  it('keeps legacy moving backgrounds and uses a fixed default in experimental mode', () => {
    expect(cameraZoomsBackground()).toBe(true);
    expect(cameraZoomsBackground(DEFAULT_ZOOM_AUTO_FOLLOW)).toBe(true);
    expect(cameraZoomsBackground({ ...DEFAULT_ZOOM_AUTO_FOLLOW, experimentalZoom: true })).toBe(false);
    expect(normalizeZoomAutoFollow(DEFAULT_ZOOM_AUTO_FOLLOW).recordly).toBeUndefined();
  });
});
