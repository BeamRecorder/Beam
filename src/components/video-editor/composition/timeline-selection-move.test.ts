import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from './engine/clip-engine';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import { prepareTimelineSelectionMove } from './timeline-selection-move';
import type { TimelineSelectionIds } from './timeline-edit-types';

const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 60_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `/media/${id}`,
  origin: 'project',
});

const visualClip = (id: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const audioClip = (id: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: `${id}-asset`,
  role: 'microphone',
  volume: 100,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  ...overrides,
});

const zoom = (id: string, startMs: number, endMs: number): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs,
  endMs,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

const clipAt = (composition: ClipComposition, id: string) => composition.clips.find((clip) => clip.id === id)!;

const selection = (clipIds: string[], zoomIds: string[] = []): TimelineSelectionIds => ({ clipIds, zoomIds });

const moveFixture = () => {
  // Keep a timeline with many independent visual lanes so this exercises the
  // same selection path as a real recording rather than a two-clip toy case.
  const independentClips = Array.from({ length: 22 }, (_, index) =>
    visualClip(`ambient-${String(index).padStart(2, '0')}`, {
      timelineStartMs: 10_000 + index * 2_000,
      trackId: `ambient-track-${String(index).padStart(2, '0')}`,
      order: index,
    }),
  );
  const clips = [
    ...independentClips,
    visualClip('collision-before', {
      timelineStartMs: 2_000,
      trackId: 'focus-track',
      order: 30,
    }),
    visualClip('focus-video', {
      timelineStartMs: 4_000,
      trackId: 'focus-track',
      groupId: 'focus-recording',
      order: 30,
    }),
    visualClip('collision-after', {
      timelineStartMs: 6_000,
      trackId: 'focus-track',
      order: 30,
    }),
    audioClip('focus-audio', {
      timelineStartMs: 4_000,
      groupId: 'focus-recording',
    }),
  ];
  const assets = clips.map((clip) => asset(clip.assetId, clip.kind === 'audio' ? 'audio' : 'video'));
  return {
    composition: createComposition(assets, clips),
    zoomElements: [zoom('focus-zoom', 4_500, 5_000), zoom('later-zoom', 50_000, 51_000)],
  };
};

describe('prepareTimelineSelectionMove', () => {
  it('moves a linked mixed clip and zoom selection while preserving unrelated identities', () => {
    const fixture = moveFixture();
    const sourceComposition = JSON.stringify(fixture.composition);
    const sourceZooms = JSON.stringify(fixture.zoomElements);
    const move = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['focus-video', 'focus-video', 'stale-clip'], ['focus-zoom', 'focus-zoom', 'stale-zoom']),
    });

    const result = move(750.4);

    expect(result.deltaMs).toBe(750);
    expect(clipAt(result.composition, 'focus-video').timelineStartMs).toBe(4_750);
    expect(clipAt(result.composition, 'focus-audio').timelineStartMs).toBe(4_750);
    expect(clipAt(result.composition, 'collision-before').timelineStartMs).toBe(2_000);
    expect(clipAt(result.composition, 'collision-after').timelineStartMs).toBe(6_000);
    expect(result.zoomElements.find((entry) => entry.id === 'focus-zoom')).toMatchObject({
      startMs: 5_250,
      endMs: 5_750,
    });
    expect(result.zoomElements.find((entry) => entry.id === 'later-zoom')).toBe(fixture.zoomElements[1]);

    expect(result.composition).not.toBe(fixture.composition);
    expect(result.composition.clips).not.toBe(fixture.composition.clips);
    expect(clipAt(result.composition, 'focus-video')).not.toBe(clipAt(fixture.composition, 'focus-video'));
    expect(clipAt(result.composition, 'focus-audio')).not.toBe(clipAt(fixture.composition, 'focus-audio'));
    expect(clipAt(result.composition, 'ambient-00')).toBe(clipAt(fixture.composition, 'ambient-00'));
    expect(result.composition.assets).toBe(fixture.composition.assets);
    expect(result.composition.assets[0]).toBe(fixture.composition.assets[0]);
    expect(result.zoomElements).not.toBe(fixture.zoomElements);
    expect(result.zoomElements.find((entry) => entry.id === 'focus-zoom')).not.toBe(fixture.zoomElements[0]);
    expect(fixture.composition.clips).toHaveLength(26);
    expect(JSON.stringify(fixture.composition)).toBe(sourceComposition);
    expect(JSON.stringify(fixture.zoomElements)).toBe(sourceZooms);
  });

  it('keeps the composition reference during a zoom-only move and caches repeated output', () => {
    const fixture = moveFixture();
    const move = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection([], ['focus-zoom']),
    });

    const first = move(500.2);
    expect(first.deltaMs).toBe(500);
    expect(first.composition).toBe(fixture.composition);
    expect(first.composition.clips).toBe(fixture.composition.clips);
    expect(first.zoomElements).not.toBe(fixture.zoomElements);
    expect(first.zoomElements[0]).not.toBe(fixture.zoomElements[0]);
    expect(first.zoomElements[1]).toBe(fixture.zoomElements[1]);
    expect(first.zoomElements[0]).toMatchObject({ startMs: 5_000, endMs: 5_500 });
    expect(move(500.4)).toBe(first);
  });

  it('reuses the cached original zoom array during a clip-only move', () => {
    const fixture = moveFixture();
    const move = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['focus-video']),
    });
    const original = move(0);
    const moved = move(500);

    expect(moved.deltaMs).toBe(500);
    expect(moved.composition).not.toBe(fixture.composition);
    expect(clipAt(moved.composition, 'focus-video').timelineStartMs).toBe(4_500);
    expect(moved.zoomElements).toBe(original.zoomElements);
    expect(moved.zoomElements).not.toBe(fixture.zoomElements);
    expect(moved.zoomElements[0]).toBe(fixture.zoomElements[0]);
    expect(moved.zoomElements[1]).toBe(fixture.zoomElements[1]);
  });

  it('clamps movement to visual collisions and to the start of the timeline', () => {
    const fixture = moveFixture();

    const moveRight = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['focus-video'], ['focus-zoom']),
    });
    const right = moveRight(99_999);
    expect(right.deltaMs).toBe(1_000);
    expect(clipAt(right.composition, 'focus-video').timelineStartMs).toBe(5_000);
    expect(right.zoomElements[0]).toMatchObject({ startMs: 5_500, endMs: 6_000 });

    const moveLeft = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['focus-video'], ['focus-zoom']),
    });
    const left = moveLeft(-99_999);
    expect(left.deltaMs).toBe(-1_000);
    expect(clipAt(left.composition, 'focus-video').timelineStartMs).toBe(3_000);
    expect(left.zoomElements[0]).toMatchObject({ startMs: 3_500, endMs: 4_000 });

    const moveToOrigin = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['ambient-00']),
    });
    const origin = moveToOrigin(-99_999);
    expect(origin.deltaMs).toBe(-10_000);
    expect(clipAt(origin.composition, 'ambient-00').timelineStartMs).toBe(0);
  });

  it('reuses the same result for equivalent rounded and clamped deltas', () => {
    const fixture = moveFixture();
    const move = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['focus-video']),
    });

    const rounded = move(250.2);
    expect(move(250.4)).toBe(rounded);

    const clamped = move(99_999);
    expect(clamped.deltaMs).toBe(1_000);
    expect(move(25_000)).toBe(clamped);

    const roundedAgain = move(250.49);
    expect(roundedAgain).toEqual(rounded);
    expect(roundedAgain).not.toBe(rounded);
    expect(move(250.49)).toBe(roundedAgain);
  });

  it('returns an unchanged result for zero, invalid, and empty moves', () => {
    const fixture = moveFixture();
    const move = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['focus-video'], ['focus-zoom']),
    });

    const zero = move(0);
    expect(zero.deltaMs).toBe(0);
    expect(zero.composition).toBe(fixture.composition);
    expect(zero.zoomElements[0]).toBe(fixture.zoomElements[0]);
    expect(move(-0)).toBe(zero);

    for (const invalidDelta of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(move(invalidDelta)).toBe(zero);
    }

    const emptyMove = prepareTimelineSelectionMove({
      ...fixture,
      selection: selection(['stale-clip'], ['stale-zoom']),
    });
    const empty = emptyMove(500);
    expect(empty.deltaMs).toBe(0);
    expect(empty.composition).toBe(fixture.composition);
    expect(empty.zoomElements[0]).toBe(fixture.zoomElements[0]);
    expect(emptyMove(0)).toBe(empty);
  });
});
