import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import { emptyComposition } from '../shared/composition-types';
import type { ClipComposition, VisualClip } from '../shared/composition-types';
import type { ZoomElement } from './zoom-types';
import { cameraEditInvalidationTime } from './camera-edit-invalidation';

const screen: VisualClip = {
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  assetId: 'video',
  trackId: 'screen',
  order: 0,
  enabled: true,
  timelineStartMs: 120_000,
  timelineDurationMs: 60_000,
  sourceInMs: 120_000,
  sourceDurationMs: 60_000,
  playbackRate: 1,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};
const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 120_000,
  endMs: 125_000,
  mode: 'auto',
  depth: 2,
  focus: { cx: 0.5, cy: 0.5 },
};
const composition = (): ClipComposition => ({ ...emptyComposition(), clips: [screen] });

describe('camera edit invalidation', () => {
  it('retains all history for unchanged screens, copied arrays and unrelated visual edits', () => {
    const base = composition();
    expect(cameraEditInvalidationTime(base, base, [zoom], [zoom])).toBe(Infinity);
    expect(cameraEditInvalidationTime(base, { ...base, clips: [...base.clips] }, [], [])).toBe(Infinity);
    expect(
      cameraEditInvalidationTime(
        base,
        { ...base, clips: [...base.clips, { ...screen, id: 'webcam', kind: 'webcam' }] },
        [],
        [],
      ),
    ).toBe(Infinity);
  });

  it.each([118_000, 121_000])('starts before the earlier old/new screen at %i ms', (start) => {
    const base = composition();
    const next = { ...base, clips: [{ ...screen, timelineStartMs: start }] };
    expect(cameraEditInvalidationTime(base, next, [], [])).toBe(Math.min(start, screen.timelineStartMs) - 1_350);
  });

  it('invalidates added, removed and changed screens including early boundaries', () => {
    const base = composition();
    const absent = { ...base, clips: [] };
    expect(cameraEditInvalidationTime(absent, base, [], [])).toBe(118_650);
    expect(cameraEditInvalidationTime(base, absent, [], [])).toBe(118_650);
    expect(cameraEditInvalidationTime(base, { ...base, clips: [{ ...screen, timelineStartMs: 1_000 }] }, [], [])).toBe(
      0,
    );
  });

  it('invalidates zoom changes early enough for connected pans, insertion and removal', () => {
    const base = composition();
    expect(cameraEditInvalidationTime(base, base, [zoom], [{ ...zoom, startMs: 118_000 }])).toBe(116_650);
    expect(cameraEditInvalidationTime(base, base, [zoom], [])).toBe(118_650);
    expect(cameraEditInvalidationTime(base, base, [], [zoom])).toBe(118_650);
  });

  it('ignores glass edits and catches transitions between glass and camera zooms', () => {
    const base = composition();
    const glass = { ...zoom, effect: 'glass' as const };
    expect(cameraEditInvalidationTime(base, base, [glass], [{ ...glass, startMs: 0 }])).toBe(Infinity);
    expect(cameraEditInvalidationTime(base, base, [glass], [zoom])).toBe(118_650);
    expect(cameraEditInvalidationTime(base, base, [zoom], [glass])).toBe(118_650);
  });

  it('rebuilds all history when global scene, animation or asset mapping changes', () => {
    const base = composition();
    expect(cameraEditInvalidationTime(base, { ...base, assets: [] }, [], [])).toBe(0);
    expect(cameraEditInvalidationTime(base, { ...base, scene: { version: 1, roots: [], groups: [] } }, [], [])).toBe(0);
    expect(cameraEditInvalidationTime(base, { ...base, animations: { version: 1, tracks: [] } }, [], [])).toBe(0);
  });
});
