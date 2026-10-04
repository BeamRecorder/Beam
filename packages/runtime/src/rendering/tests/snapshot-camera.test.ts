// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition, createDefaultClipAppearance } from '@beam/engine';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { CompositionCameraInputs } from '@beam/engine/zoom/composition-camera';
import type { AppliedZoom } from '@beam/engine/zoom/zoom-types';
import * as camera from '@beam/engine/zoom/composition-camera';
import * as mapping from '@beam/engine/shared/timeline-mapping';
import { createSnapshotCameraEvaluator } from '../snapshot-camera';

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
  it('projects automatic focus into the screen transform while preserving manual focus', () => {
    const inputs = mappedInputs(withScreen());
    const focus = { cx: 0, cy: 0 };
    const zoom = { mode: 'auto' } as AppliedZoom;
    expect(inputs.mapFocus!(focus, zoom, 1500)).toEqual({ cx: 0.25, cy: 0.25 });
    expect(inputs.mapFocus!(focus, { ...zoom, mode: 'manual' }, 1500)).toBe(focus);
    expect(inputs.mapFocus!(focus, zoom, 500)).toBe(focus);
  });
});
