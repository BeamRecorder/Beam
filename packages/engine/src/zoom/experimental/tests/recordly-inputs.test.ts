// @vitest-environment node
import { expect, it } from 'vitest';
import { emptyComposition } from '../../../shared/composition-types';
import { createDefaultClipAppearance } from '../../../shared/composition-defaults';
import { recordlyCompositionClips, recordlyTelemetry } from '../recordly-inputs';
import type { VisualClip } from '../../../shared/composition-types';
const screen: VisualClip = {
  id: 'screen',
  name: 'Screen',
  kind: 'screen',
  assetId: 'asset',
  timelineStartMs: 1000,
  timelineDurationMs: 4000,
  sourceInMs: 500,
  sourceDurationMs: 8000,
  playbackRate: 2,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};
it('adapts only enabled screens with actual assets, preserving session offsets and speed', () => {
  const composition = emptyComposition();
  composition.assets.push({
    id: 'asset',
    kind: 'video',
    name: 'Screen',
    src: 'memory:screen',
    fileName: null,
    durationMs: 10000,
    width: 1920,
    height: 1080,
    origin: 'session',
    sessionStartMs: 3000,
  });
  composition.clips.push(
    screen,
    { ...screen, id: 'off', enabled: false },
    { ...screen, id: 'missing', assetId: 'missing' },
    { ...screen, id: 'video', kind: 'video' },
  );
  expect(recordlyCompositionClips(composition)).toEqual([
    { id: 'screen', startMs: 1000, endMs: 5000, sourceStartMs: 3500, speed: 2 },
  ]);
  delete composition.assets[0]!.sessionStartMs;
  expect(recordlyCompositionClips(composition)[0]!.sourceStartMs).toBe(500);
});
it('does not fabricate clips or mutate an empty composition', () => {
  const composition = emptyComposition(),
    before = structuredClone(composition);
  expect(recordlyCompositionClips(composition)).toEqual([]);
  expect(composition).toEqual(before);
});
it('preserves known button identities and supported cursor types without manufacturing other events', () => {
  const points = [
    { timeMs: 0, cx: 0.2, cy: 0.3, interactionType: 'click' as const, mouseButton: 1, cursorType: 'arrow' },
    { timeMs: 1, cx: 0.2, cy: 0.3, mouseButton: 2, cursorType: 'pointer' },
    { timeMs: 2, cx: 0.2, cy: 0.3, mouseButton: 3, cursorType: 'text' },
    { timeMs: 3, cx: 0.2, cy: 0.3, mouseButton: 4, cursorType: 'custom' },
    { timeMs: 4, cx: 0.2, cy: 0.3 },
  ];
  const before = structuredClone(points),
    result = recordlyTelemetry(points);
  expect(result.map((point) => point.mouseButton)).toEqual([1, 2, 3, undefined, undefined]);
  expect(result.map((point) => point.cursorType)).toEqual(['arrow', 'pointer', 'text', undefined, undefined]);
  expect(result[3]).not.toHaveProperty('mouseButton');
  expect(result[3]).not.toHaveProperty('cursorType');
  expect(points).toEqual(before);
  expect(recordlyTelemetry([])).toEqual([]);
});
