import { describe, expect, it } from 'vitest';
import { applyRecordingZoomMode, recordingZoomMode } from './recording-zoom-preference';
import { DEFAULT_ORBIT_SETTINGS } from './orbit-settings';
import type { ZoomElement } from './zoom-types';
const zoom: ZoomElement = {
  id: 'auto',
  sessionId: 'session',
  startMs: 1000,
  endMs: 2000,
  mode: 'auto',
  depth: 2,
  focus: { cx: 0.3, cy: 0.4 },
  tiltHorizontal: 0.8,
  tiltVertical: -0.4,
};
describe('recording zoom preference', () => {
  it.each(['off', '2d', '3d', 'orbit', 'glass'] as const)('restores %s', (mode) => {
    expect(recordingZoomMode(mode)).toBe(mode);
  });
  it.each([undefined, null, '', '4d', 3, {}, false])('uses the 2D default for %j', (value) => {
    expect(recordingZoomMode(value)).toBe('2d');
  });
  it.each(['off', '2d', '3d', 'orbit'] as const)(
    'applies %s while preserving detected positions and perspective axes',
    (mode) => {
      expect(applyRecordingZoomMode(zoom, mode)).toEqual({
        ...zoom,
        enabled: mode !== 'off',
        projection: mode === '3d' || mode === 'orbit' ? 'orbit' : '2d',
        ...(mode === '3d' || mode === 'orbit'
          ? { orbitSettings: DEFAULT_ORBIT_SETTINGS, tiltIntensity: 1, transition: 'cinematic' }
          : {}),
      });
      expect(zoom).not.toHaveProperty('enabled');
    },
  );
});
