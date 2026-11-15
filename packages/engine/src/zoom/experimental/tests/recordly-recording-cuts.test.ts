// @vitest-environment node
import { expect, it } from 'vitest';
import { createRecordlyCamera } from '../recordly-camera';
import { normalizeRecordlyZoom } from '../../recordly-settings';
import type { ZoomElement } from '../../zoom-types';
const whole: ZoomElement = {
  id: 'whole',
  sessionId: 's',
  startMs: 0,
  endMs: 6000,
  depth: 3,
  mode: 'auto',
  focus: { cx: 0.5, cy: 0.5 },
  focusSpace: 'source',
  linkedClipId: 'screen',
};
const parts: ZoomElement[] = [
  { ...whole, id: 'first', endMs: 3000, splitGroupId: 'cut' },
  { ...whole, id: 'second', startMs: 3000, linkedClipId: 'screen-second', splitGroupId: 'cut' },
];
const make = (zooms: ZoomElement[]) =>
  createRecordlyCamera({
    zooms,
    telemetry: [],
    autoFollow: {
      experimentalZoom: true,
      safeZone: 0.5,
      responsiveness: 0.55,
      directionLock: true,
      recordly: normalizeRecordlyZoom({ connectZooms: false }),
    },
  });
it('presents adjacent untouched recording cuts as the same original zoom envelope', () => {
  const original = make([whole]),
    split = make(parts);
  for (const timeMs of [0, 1000, 2900, 2999, 3000, 3001, 3100, 4000, 6000]) {
    const request = { timeMs, isPlaying: true, exporting: true };
    expect(split.compose!(request)).toEqual(original.compose!(request));
  }
});
it('releases continuity when the recording parts are separated', () => {
  const split = make([parts[0]!, { ...parts[1]!, startMs: 3100 }]);
  expect(split.compose!({ timeMs: 3050, isPlaying: false, shouldSnapPausedFrame: true }).scale).toBe(1);
});
it('keeps independently edited split zooms independent', () => {
  const split = make([parts[0]!, { ...parts[1]!, depth: 4 }]);
  expect(split.compose!({ timeMs: 4500, isPlaying: false, shouldSnapPausedFrame: true }).scale).toBeCloseTo(2.2, 8);
});
