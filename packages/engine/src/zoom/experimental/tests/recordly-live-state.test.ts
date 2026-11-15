// @vitest-environment node
import { expect, it } from 'vitest';
import { createRecordlyCamera } from '../recordly-camera';
import { normalizeRecordlyZoom } from '../../recordly-settings';
import { recordlyFocusOnCanvas } from '../recordly-focus';
import type { CompositionCameraInputs } from '../../composition-camera-types';
import type { ZoomElement } from '../../zoom-types';
const zoom: ZoomElement = {
  id: 'a',
  sessionId: 's',
  startMs: 0,
  endMs: 10000,
  depth: 3,
  mode: 'auto',
  focus: { cx: 0.5, cy: 0.5 },
};
const inputs: CompositionCameraInputs = {
  zooms: [zoom],
  telemetry: [
    { timeMs: 0, cx: 0.1, cy: 0.5 },
    { timeMs: 4000, cx: 0.9, cy: 0.5 },
  ],
  autoFollow: { experimentalZoom: true, safeZone: 0.5, responsiveness: 0.55, directionLock: true },
};
it('retains live camera momentum across settings edits without contaminating query/export histories', () => {
  const before = createRecordlyCamera(inputs);
  for (const timeMs of [0, 1000, 3000, 3017]) before.compose!({ timeMs, isPlaying: true });
  const expected = before.compose!({ timeMs: 3034, isPlaying: true });
  const continued = createRecordlyCamera(inputs, { previous: before, preserveLive: true, unchangedBeforeMs: 0 });
  expect(continued.compose!({ timeMs: 3034, isPlaying: true })).toEqual(expected);
  expect(continued.sample(2000)).toEqual(createRecordlyCamera(inputs).sample(2000));
  continued.invalidate();
  expect(continued.compose!({ timeMs: 4000, isPlaying: true })).toEqual(
    createRecordlyCamera(inputs).compose!({ timeMs: 4000, isPlaying: true }),
  );
});
it('uses new targets and tuning on the retained springs rather than snapping into a new motion', () => {
  const previous = createRecordlyCamera(inputs);
  for (const timeMs of [0, 1000, 3000]) previous.compose!({ timeMs, isPlaying: true });
  const next = {
    ...inputs,
    autoFollow: {
      ...inputs.autoFollow!,
      recordly: normalizeRecordlyZoom({ cameraSpringMassMultiplier: 3, zoomBackground: false }),
    },
  };
  const continued = createRecordlyCamera(next, { previous, preserveLive: true, unchangedBeforeMs: 0 }),
    fresh = createRecordlyCamera(next);
  expect(continued.compose!({ timeMs: 3017, isPlaying: true }).focus.cx).not.toBe(
    fresh.compose!({ timeMs: 3017, isPlaying: true }).focus.cx,
  );
});
it('discards live history when retention was not authorized', () => {
  const previous = createRecordlyCamera(inputs);
  previous.compose!({ timeMs: 1000, isPlaying: true });
  const next = createRecordlyCamera(inputs, { previous, unchangedBeforeMs: 1000 });
  expect(next.compose!({ timeMs: 4000, isPlaying: true })).toEqual(
    createRecordlyCamera(inputs).compose!({ timeMs: 4000, isPlaying: true }),
  );
});
it('returns finite identity for invalid viewport geometry', () => {
  for (const viewport of [
    { width: 0, height: 1080 },
    { width: 1920, height: 0 },
  ]) {
    const sample = createRecordlyCamera({ ...inputs, viewport }).compose!({ timeMs: 3000, isPlaying: true });
    expect(sample).toEqual({ scale: 1, focus: { cx: 0.5, cy: 0.5 } });
  }
});
it('maps explicit source and viewport focuses to Beam handles independently of mode', () => {
  const geometry = {
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    mask: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
  };
  for (const mode of ['auto', 'manual'] as const) {
    expect(
      recordlyFocusOnCanvas({ ...zoom, mode, focusSpace: 'source', focus: { cx: 0.6, cy: 0.4 } }, geometry),
    ).toEqual({ cx: expect.closeTo(0.66, 12), cy: expect.closeTo(0.38, 12) });
    expect(recordlyFocusOnCanvas({ ...zoom, mode, focusSpace: 'viewport' }, geometry)).toEqual({ cx: 0.5, cy: 0.5 });
  }
  expect(recordlyFocusOnCanvas(zoom, geometry)).toBe(zoom.focus);
});

it('preserves a plain pause even if the media clock advanced before the last frame was painted', () => {
  const evaluator = createRecordlyCamera(inputs);
  const before = evaluator.compose!({ timeMs: 3000, isPlaying: true });
  expect(evaluator.compose!({ timeMs: 3009, isPlaying: false })).toEqual(before);
  const after = evaluator.compose!({ timeMs: 4000, isPlaying: false, shouldSnapPausedFrame: true });
  expect(after.focus.cx).not.toBe(before.focus.cx);
});
