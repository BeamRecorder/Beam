// @vitest-environment node
import { expect, it } from 'vitest';
import { emptyComposition } from '../../../shared/composition-types';
import { createDefaultClipAppearance } from '../../../shared/composition-defaults';
import type { VisualClip } from '../../../shared/composition-types';
import { createRecordlySourceClock } from '../recordly-source-clock';
import { createRecordlyCamera } from '../recordly-camera';
import { recordlyCompositionClips } from '../recordly-inputs';
import { experimentalRecordingZoomPlan } from '../experimental-recording-zooms';
const clip: VisualClip = {
  id: 'screen',
  name: 'screen',
  kind: 'screen',
  assetId: 'asset',
  timelineStartMs: 0,
  timelineDurationMs: 10000,
  sourceInMs: 50,
  sourceDurationMs: 20000,
  playbackRate: 2,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};
function composition() {
  const result = emptyComposition();
  result.assets.push({
    id: 'asset',
    name: 'screen',
    kind: 'video',
    src: 'memory:screen',
    fileName: null,
    width: 1920,
    height: 1080,
    durationMs: 40000,
    origin: 'session',
    sessionId: 's',
    sessionStartMs: 5000,
  });
  result.clips.push({ ...clip });
  return result;
}
it('selects the screen at the original fractional timestamp, then rounds timeline and source like upstream', () => {
  const result = composition(),
    clock = createRecordlySourceClock(result, (time) => (time < 5000 ? clip : null));
  expect(clock(400.49)).toEqual({ clipId: 'screen', timeMs: 5850 });
  expect(clock(400.51)).toEqual({ clipId: 'screen', timeMs: 5852 });
  expect(clock(4999.9)).toEqual({ clipId: 'screen', timeMs: 15050 });
  expect(clock(5000)).toBeNull();
});
it('does not invent a source for missing or hydrating media', () => {
  const result = composition();
  expect(createRecordlySourceClock(result, () => null)(1000)).toBeNull();
  expect(createRecordlySourceClock(result, () => ({ ...clip, assetId: 'missing' }))(1000)).toBeNull();
  delete result.assets[0]!.sessionStartMs;
  expect(createRecordlySourceClock(result, () => clip)(1000)?.timeMs).toBe(2050);
});
it('holds the exact frozen source independently of its timeline length and playback rate', () => {
  const result = composition(),
    clock = createRecordlySourceClock(result, () => ({ ...clip, freezeFrameSourceMs: 3000 }));
  for (const timeMs of [0, 1000, 9000]) expect(clock(timeMs)).toEqual({ clipId: 'screen', timeMs: 8000 });
});
it('follows the foreground screen rather than the first overlapping source interval, including paused shutter sampling', () => {
  const result = composition();
  result.assets[0]!.sessionStartMs = 0;
  const a = { ...clip, sourceInMs: 0, playbackRate: 1 },
    b = { ...a, id: 'foreground', timelineStartMs: 5000, timelineDurationMs: 3000, sourceInMs: 20000, order: 1 };
  result.clips = [a, b];
  const screenAt = (time: number) => (time >= 5000 && time < 8000 ? b : a);
  const inputs = {
    zooms: [
      {
        id: 'zoom',
        sessionId: 's',
        startMs: 0,
        endMs: 10000,
        depth: 3 as const,
        mode: 'auto' as const,
        focus: { cx: 0.5, cy: 0.5 },
      },
    ],
    telemetry: [
      { timeMs: 0, cx: 0.1, cy: 0.5 },
      { timeMs: 10000, cx: 0.1, cy: 0.5 },
      { timeMs: 20000, cx: 0.9, cy: 0.5 },
      { timeMs: 30000, cx: 0.9, cy: 0.5 },
    ],
    recordlyClips: recordlyCompositionClips(result),
    recordlySourceAt: createRecordlySourceClock(result, screenAt),
  };
  const camera = createRecordlyCamera(inputs);
  const inside = camera.compose!({ timeMs: 6000, isPlaying: false, shouldSnapPausedFrame: true });
  expect(inside.focus.cx).toBeCloseTo(0.7222222222222222, 12);
  const first = camera.compose!({ timeMs: 5000, isPlaying: false, shouldSnapPausedFrame: true });
  expect(first.recordly?.pan.velocity).toEqual({ x: 0, y: 0 });
  expect(first.recordly?.zoom.strength).toBe(0);
  const resumed = camera.compose!({ timeMs: 8000, isPlaying: false, shouldSnapPausedFrame: true });
  expect(resumed.focus.cx).toBeCloseTo(0.2777777777777778, 12);
  expect(resumed.recordly?.pan.velocity).toEqual({ x: 0, y: 0 });
});
it.each([0, 1000])(
  'does not follow future cursor movements or generate new clicks in a Hold segment at %i',
  (freezeFrameSourceMs) => {
    const result = composition();
    result.assets[0]!.sessionStartMs = 0;
    const frozen = { ...clip, sourceInMs: 0, playbackRate: 1, freezeFrameSourceMs };
    result.clips = [frozen];
    const telemetry = [
      { timeMs: 0, cx: 0.1, cy: 0.5 },
      { timeMs: 1000, cx: 0.1, cy: 0.5 },
      { timeMs: 9000, cx: 0.9, cy: 0.5, interactionType: 'click' as const },
      { timeMs: 10000, cx: 0.9, cy: 0.5 },
    ];
    const camera = createRecordlyCamera({
      zooms: [
        { id: 'zoom', sessionId: 's', startMs: 0, endMs: 10000, depth: 3, mode: 'auto', focus: { cx: 0.5, cy: 0.5 } },
      ],
      telemetry,
      recordlyClips: recordlyCompositionClips(result),
      recordlySourceAt: createRecordlySourceClock(result, () => frozen),
    });
    expect(camera.compose!({ timeMs: 8500, isPlaying: false, shouldSnapPausedFrame: true }).focus.cx).toBeCloseTo(
      0.2777777777777778,
      12,
    );
    expect(experimentalRecordingZoomPlan(result, 's', telemetry, [])).toEqual({ elements: [], status: 'no-slots' });
  },
);
