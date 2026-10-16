// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition, createDefaultClipAppearance } from '@beam/engine';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { CompositionCameraInputs } from '@beam/engine/zoom/composition-camera';
import type { AppliedZoom } from '@beam/engine/zoom/zoom-types';
import * as camera from '@beam/engine/zoom/composition-camera';
import * as mapping from '@beam/engine/shared/timeline-mapping';
import { createSnapshotCameraEvaluator } from '../snapshot-camera';
import { generateRecordingZooms } from '@beam/engine/zoom/recording-zoom-generation';
import { calmOrbitOpening } from '@beam/engine/zoom/tests/fixtures/calm-orbit-opening';

afterEach(() => vi.restoreAllMocks());
const mappedInputs = (snapshot: CompositionSnapshot) => {
  let inputs!: CompositionCameraInputs;
  const original = camera.createCompositionCameraEvaluator;
  vi.spyOn(camera, 'createCompositionCameraEvaluator').mockImplementationOnce((value) => {
    inputs = value;
    return original(value);
  });
  createSnapshotCameraEvaluator(snapshot, 640, 480);
  return inputs;
};
const withScreen = () => {
  const input = snapshot();
  input.composition.assets = [
    {
      id: 'screen',
      kind: 'video',
      name: 'Screen',
      fileName: null,
      durationMs: 10000,
      width: 640,
      height: 480,
      src: 'screen.webm',
      origin: 'session',
      sessionStartMs: 3000,
    },
  ];
  input.composition.clips = [
    {
      id: 'screen',
      kind: 'screen',
      name: 'Screen',
      assetId: 'screen',
      timelineStartMs: 1000,
      timelineDurationMs: 2000,
      sourceInMs: 500,
      sourceDurationMs: 4000,
      playbackRate: 2,
      enabled: true,
      order: 0,
      trackId: 'screen',
      transform: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      appearance: createDefaultClipAppearance('screen'),
      isMirrored: false,
      isMirroredY: false,
    },
  ];
  return input;
};

const snapshot = (): CompositionSnapshot =>
  ({
    composition: emptyComposition(),
    zooms: [],
    cursor: { telemetry: [] },
    canvas: { width: 640, height: 480, showBackground: false },
  }) as unknown as CompositionSnapshot;
describe('headless snapshot camera', () => {
  it('keeps an unanimated scene at its identity camera', () => {
    const camera = createSnapshotCameraEvaluator(snapshot(), 640, 480).sample(0);
    expect(camera.scale).toBe(1);
    expect(camera.focus).toMatchObject({ cx: 0.5, cy: 0.5 });
  });
  it('samples a paused scene deterministically when seeking forwards and backwards', () => {
    const evaluator = createSnapshotCameraEvaluator(snapshot(), 640, 480);
    const first = evaluator.sample(0);
    evaluator.sample(5000);
    expect(evaluator.sample(0)).toEqual(first);
  });
  it('does not mutate authored data while evaluating different source dimensions', () => {
    const input = snapshot();
    const original = JSON.stringify(input);
    createSnapshotCameraEvaluator(input, 1920, 1080).sample(1000);
    expect(JSON.stringify(input)).toBe(original);
  });
  it('maps trimmed and retimed screen clips into their recorded telemetry clock', () => {
    const inputs = mappedInputs(withScreen());
    expect(inputs.mapTelemetryTime!(1500)).toBe(4500);
    expect(inputs.mapTelemetryTime!(500)).toBe(500);
    vi.spyOn(mapping, 'sessionTimeAt').mockReturnValueOnce(null);
    expect(inputs.mapTelemetryTime!(1500)).toBe(1500);
  });
  it('bounds cursor prediction to the current screen clip, with no prediction inside a gap', () => {
    const inputs = mappedInputs(withScreen());
    expect(inputs.followEndMsAt!(1500)).toBe(3000);
    expect(inputs.followEndMsAt!(500)).toBe(500);
    expect(inputs.followEndMsAt!(3000)).toBe(3000);
  });
  it('stops anticipation at an overlapping screen even when the original clip is still active', () => {
    const input = withScreen();
    input.composition.clips.push({
      ...input.composition.clips[0]!,
      id: 'insert',
      timelineStartMs: 1600,
      timelineDurationMs: 20,
      order: 1,
    });
    const inputs = mappedInputs(input);
    expect(inputs.followEndMsAt!(1500)).toBe(1600);
    expect(inputs.followEndMsAt!(1600)).toBe(1620);
    expect(inputs.followEndMsAt!(1620)).toBe(3000);
  });
  it('keeps anticipating within the current screen after an irrelevant screen boundary has passed', () => {
    const input = withScreen();
    input.composition.clips.push({
      ...input.composition.clips[0]!,
      id: 'behind',
      timelineStartMs: 1800,
      timelineDurationMs: 20,
      order: -1,
    });
    const inputs = mappedInputs(input);
    expect(inputs.followEndMsAt!(1700)).toBe(1800);
    expect(inputs.followEndMsAt!(1800)).toBe(1820);
    expect(inputs.followEndMsAt!(1820)).toBe(3000);
  });
  it('projects automatic focus into the screen transform while preserving manual focus', () => {
    const inputs = mappedInputs(withScreen());
    const focus = { cx: 0, cy: 0 };
    const zoom = { mode: 'auto' } as AppliedZoom;
    expect(inputs.mapFocus!(focus, zoom, 1500)).toEqual({ cx: 0.25, cy: 0.25 });
    expect(inputs.mapFocus!(focus, { ...zoom, mode: 'manual' }, 1500)).toBe(focus);
    expect(inputs.mapFocus!(focus, zoom, 500)).toBe(focus);
  });
});

const calmOrbitSnapshot = () => {
  const input = withScreen();
  const asset = input.composition.assets[0]!;
  const clip = input.composition.clips[0]!;
  if (asset.kind !== 'video' || clip.kind !== 'screen') throw new Error('Expected the screen fixture');
  Object.assign(asset, { width: 3072, height: 1862, durationMs: 20883, sessionStartMs: 0, sessionId: 'take' });
  Object.assign(clip, {
    timelineStartMs: 0,
    timelineDurationMs: 20883,
    sourceInMs: 0,
    sourceDurationMs: 20883,
    playbackRate: 1,
    transform: { x: 0.0034549587912830275, y: -0.00780423811229532, width: 1, height: 1 },
  });
  input.canvas = { preset: '16:9', width: 1920, height: 1080, showBackground: true };
  input.cursor.telemetry = calmOrbitOpening;
  input.zooms = generateRecordingZooms(input.composition, 'take', calmOrbitOpening, []);
  return input;
};

it('keeps the recorded Calm Orbit opening monotonic with its real source aspect ratio and translated video', () => {
  const input = calmOrbitSnapshot();
  const camera = createSnapshotCameraEvaluator(input, 3072, 1862);
  let previous = camera.sample(0).focus.cx;
  for (let time = 10; time <= 1104; time += 10) {
    const current = camera.sample(time).focus.cx;
    expect(current).toBeLessThanOrEqual(previous + 1e-9);
    expect(current).toBeGreaterThan(0.4785);
    previous = current;
  }
  expect(camera.sample(1104).focus.cx).toBeCloseTo(0.478596, 6);
});

it('follows the first Calm Orbit drag progressively instead of waiting then catching up', () => {
  const camera = createSnapshotCameraEvaluator(calmOrbitSnapshot(), 3072, 1862);
  const before = camera.sample(2655).focus.cx;
  expect(camera.sample(3500).focus.cx).toBeGreaterThan(before + 0.001);
  let previous = before;
  for (let time = 2665; time <= 4500; time += 10) {
    const focus = camera.sample(time).focus.cx;
    expect(focus).toBeGreaterThanOrEqual(previous - 1e-9);
    expect(focus - previous).toBeLessThan(0.0012);
    previous = focus;
  }
});
