import { describe, expect, it, vi } from 'vitest';
import { createRetainedCamera } from './retained-camera';
import type { RetainedCameraRequest } from './retained-camera-types';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { createCompositionCameraEvaluator } from '@beam/engine/zoom/composition-camera';
import { splitClip, deleteClip } from '@beam/engine/commands/clip-engine';
import { prepareTimelineSelectionMove } from '@beam/engine/composition/timeline-selection-move';

const request = (): RetainedCameraRequest => ({
  composition: emptyComposition(),
  zooms: [],
  stableInputs: ['geometry'],
  create: vi.fn(() => ({ sample: () => ({ scale: 1, focus: { cx: 0.5, cy: 0.5 } }), invalidate: vi.fn() })),
});

describe('retained preview camera', () => {
  it('keeps the evaluator for stable inputs and copied zoom arrays', () => {
    const camera = createRetainedCamera(),
      value = request();
    const first = camera.get(value);
    expect(camera.get(value)).toBe(first);
    expect(camera.get({ ...value, zooms: [...value.zooms] })).toBe(first);
    expect(value.create).toHaveBeenCalledOnce();
  });

  it('borrows unchanged history for document and zoom drafts', () => {
    const camera = createRetainedCamera(),
      value = request();
    const previous = camera.get(value);
    camera.get({ ...value, composition: { ...value.composition } });
    expect(value.create).toHaveBeenLastCalledWith({ previous, unchangedBeforeMs: Infinity });
    const zoom: ZoomElement = {
      id: 'zoom',
      sessionId: 's',
      startMs: 120_000,
      endMs: 125_000,
      mode: 'manual',
      depth: 2,
      focus: { cx: 0.5, cy: 0.5 },
    };
    camera.get({ ...value, zooms: [zoom] });
    expect(value.create).toHaveBeenLastCalledWith({ previous: expect.anything(), unchangedBeforeMs: 118_650 });
  });

  it.each([{ stableInputs: ['resized'] }, { stableInputs: ['geometry', 'quality'] }, { stableInputs: [] }])(
    'discards checkpoints for changed global inputs $stableInputs',
    ({ stableInputs }) => {
      const camera = createRetainedCamera(),
        value = request();
      camera.get(value);
      camera.get({ ...value, stableInputs });
      expect(value.create).toHaveBeenLastCalledWith(undefined);
      expect(value.create).toHaveBeenCalledTimes(2);
    },
  );

  it('releases retained state on disposal and starts a fresh camera on reuse', () => {
    const camera = createRetainedCamera(),
      value = request();
    const first = camera.get(value);
    camera.clear();
    expect(camera.get(value)).not.toBe(first);
    expect(value.create).toHaveBeenLastCalledWith(undefined);
    camera.clear();
    camera.clear();
  });

  it('keeps a three-minute split/delete/drag responsive without changing deterministic camera samples', () => {
    const screen: VisualClip = {
      id: 'screen',
      kind: 'screen',
      name: 'Screen',
      assetId: 'video',
      trackId: 'screen',
      order: 0,
      enabled: true,
      timelineStartMs: 0,
      timelineDurationMs: 180_000,
      sourceInMs: 0,
      sourceDurationMs: 180_000,
      playbackRate: 1,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('screen'),
      isMirrored: false,
      isMirroredY: false,
    };
    const composition = {
      ...emptyComposition(),
      assets: [
        {
          id: 'video',
          kind: 'video' as const,
          name: 'Recording',
          fileName: 'screen.mp4',
          durationMs: 180_000,
          width: 1920,
          height: 1080,
          src: 'screen.mp4',
          origin: 'session' as const,
          sessionId: 's',
        },
      ],
      clips: [screen],
    };
    const first = splitClip(composition, 'screen', 120_000);
    const middleId = first.clips.find((clip) => clip.timelineStartMs === 120_000)!.id;
    const split = splitClip(first, middleId, 122_000);
    const cut = deleteClip(split, middleId);
    const rightId = cut.clips.find((clip) => clip.timelineStartMs === 122_000)!.id;
    const zooms: ZoomElement[] = Array.from({ length: 60 }, (_, i) => ({
      id: `zoom-${i}`,
      sessionId: 's',
      startMs: i * 3_000,
      endMs: i * 3_000 + 2_500,
      mode: 'auto',
      depth: 2,
      linkedClipId: null,
      focus: { cx: 0.5, cy: 0.5 },
    }));
    const telemetry = Array.from({ length: 10_800 }, (_, i) => ({
      timeMs: (i * 1000) / 60,
      cx: 0.5 + 0.3 * Math.sin(i / 600),
      cy: 0.5,
    }));
    const mapFocus = vi.fn((focus: ZoomElement['focus'], _zoom: unknown, _timeMs: number) => focus);
    const retained = createRetainedCamera();
    const create = () => createCompositionCameraEvaluator({ zooms, telemetry, mapFocus });
    retained.get({ composition: cut, zooms, stableInputs: [telemetry], create }).sample(122_500);
    mapFocus.mockClear();
    const previewMove = prepareTimelineSelectionMove({
      composition: cut,
      zoomElements: zooms,
      selection: { clipIds: [rightId], zoomIds: [] },
    });
    for (const deltaMs of [-500, -1_000, -1_500, -2_000, -1_000, 0]) {
      const preview = previewMove(deltaMs);
      const evaluator = retained.get({
        composition: preview.composition,
        zooms,
        stableInputs: [telemetry],
        create: (reuse) => createCompositionCameraEvaluator({ zooms, telemetry, mapFocus }, reuse),
      });
      const actual = evaluator.sample(122_500);
      expect(actual).toEqual(createCompositionCameraEvaluator({ zooms, telemetry }).sample(122_500));
    }
    // Six drafts must not replay the 120 seconds before the deletion.
    expect(mapFocus.mock.calls.length).toBeLessThan(6_000);
    expect(mapFocus.mock.calls.every((call) => call[2] >= 118_000)).toBe(true);
    expect(cut.clips.find((clip) => clip.id === rightId)?.timelineStartMs).toBe(122_000);
  });
});
