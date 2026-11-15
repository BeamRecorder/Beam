// @vitest-environment node
import { expect, it } from 'vitest';
import { createRecordlyCamera } from '../recordly-camera';
import type { ZoomElement } from '../../zoom-types';
import { DEFAULT_ZOOM_AUTO_FOLLOW } from '../../zoom-types';
const zoom: ZoomElement = {
  id: 'a',
  sessionId: 's',
  startMs: 1000,
  endMs: 8000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 3,
  mode: 'auto',
};
it('ignores disabled zooms and glass lenses and handles invalid requests without poisoning later frames', () => {
  const neutral = createRecordlyCamera({
    zooms: [
      { ...zoom, enabled: false },
      { ...zoom, id: 'b', effect: 'glass' },
    ],
    telemetry: [],
    frameRate: NaN,
  });
  for (const time of [-1, NaN, Infinity, 5000])
    expect(neutral.sample(time)).toEqual({ scale: 1, focus: { cx: 0.5, cy: 0.5 } });
  const input = {
    zooms: [zoom],
    telemetry: [
      { timeMs: NaN, cx: 0.5, cy: 0.5 },
      { timeMs: 0, cx: 2, cy: -1 },
    ],
  };
  const first = createRecordlyCamera(input),
    second = createRecordlyCamera(input);
  first.sample(NaN);
  first.sample(-1);
  expect(first.sample(4000)).toEqual(second.sample(4000));
  expect(first.sample(4000).focus.cx).toBeGreaterThan(0.5);
});
it('preserves fixed click framing when cursor follow is explicitly disabled', () => {
  const input = { zooms: [zoom], telemetry: [{ timeMs: 0, cx: 0.95, cy: 0.1 }] };
  const following = createRecordlyCamera(input),
    fixed = createRecordlyCamera({ ...input, autoFollow: { ...DEFAULT_ZOOM_AUTO_FOLLOW, enabled: false } });
  expect(following.sample(4000).focus.cx).toBeGreaterThan(0.5);
  expect(fixed.sample(4000).focus).toEqual({ cx: 0.5, cy: 0.5 });
});
it('maps source timestamps through edits, keeps returns owned and makes off-grid queries history-independent', () => {
  const input = {
    zooms: [zoom],
    telemetry: [
      { timeMs: 0, cx: 0.1, cy: 0.5 },
      { timeMs: 9000, cx: 0.9, cy: 0.5 },
    ],
    mapTelemetryTime: (time: number) => 9000 - time,
    frameRate: 30,
  };
  const first = createRecordlyCamera(input),
    second = createRecordlyCamera(input);
  first.sample(2500.1);
  first.sample(2510.8);
  const actual = first.sample(4500);
  expect(actual).toEqual(second.sample(4500));
  actual.focus.cx = 0;
  expect(first.sample(4500).focus.cx).not.toBe(0);
  const last = first.sample(7000);
  first.sample(4500);
  expect(first.sample(7000)).toEqual(last);
});
