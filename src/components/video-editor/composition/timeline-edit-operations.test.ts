import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from './engine/clip-engine';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import { deleteTimelineItems, rippleRangeForSelection, shiftTimelineSelection } from './timeline-edit-operations';
import type { TimelineSelectionIds } from './timeline-edit-types';

const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 20_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `/media/${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  origin: 'project',
});

const visualClip = (id: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
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
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 1,
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

const composition = (clips: ClipComposition['clips']): ClipComposition =>
  createComposition(
    clips
      .filter((clip) => 'assetId' in clip)
      .map((clip) => asset(clip.assetId, clip.kind === 'audio' ? 'audio' : 'video'))
      .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index),
    clips,
  );

const selection = (clipIds: string[], zoomIds: string[] = []): TimelineSelectionIds => ({ clipIds, zoomIds });

const clipAt = (next: ClipComposition, id: string) => next.clips.find((clip) => clip.id === id)!;

describe('timeline edit operations', () => {
  describe('rippleRangeForSelection', () => {
    it('returns one range when all selected clips share the same envelope', () => {
      const next = composition([
        visualClip('screen', { timelineStartMs: 1_000, trackId: 'screen-track' }),
        audioClip('microphone', { timelineStartMs: 1_000 }),
      ]);

      expect(rippleRangeForSelection(next, ['screen', 'microphone'])).toEqual({
        startMs: 1_000,
        endMs: 3_000,
      });
    });

    it('rejects a selection whose clips have different timing', () => {
      const next = composition([
        visualClip('screen', { trackId: 'screen-track' }),
        audioClip('microphone', { timelineStartMs: 250, timelineDurationMs: 1_750, sourceDurationMs: 1_750 }),
      ]);

      expect(rippleRangeForSelection(next, ['screen', 'microphone'])).toBeNull();
    });

    it('rejects a range that overlaps an unselected clip', () => {
      const next = composition([
        visualClip('selected', { timelineDurationMs: 2_000, sourceDurationMs: 2_000, trackId: 'selected-track' }),
        visualClip('overlap', {
          timelineStartMs: 1_000,
          timelineDurationMs: 2_000,
          sourceDurationMs: 2_000,
          trackId: 'other-track',
        }),
      ]);

      expect(rippleRangeForSelection(next, ['selected'])).toBeNull();
    });
  });

  describe('deleteTimelineItems', () => {
    const editFixture = () => {
      const next = composition([
        visualClip('screen-before', { timelineStartMs: 0, trackId: 'screen-track' }),
        visualClip('screen-after', { timelineStartMs: 2_000, trackId: 'screen-track' }),
        visualClip('camera-before', { timelineStartMs: 0, trackId: 'camera-track' }),
        visualClip('camera-after', { timelineStartMs: 2_000, trackId: 'camera-track' }),
        audioClip('microphone-before', { timelineStartMs: 0 }),
        audioClip('microphone-after', { timelineStartMs: 2_000 }),
      ]);
      const zoomElements = [zoom('zoom-selected', 500, 1_000), zoom('zoom-after', 3_000, 3_500)];
      return { next, zoomElements };
    };

    it('lifts selected clips and zooms without moving the remaining timeline', () => {
      const { next, zoomElements } = editFixture();
      const result = deleteTimelineItems({
        composition: next,
        zoomElements,
        selection: selection(['screen-before', 'camera-before', 'microphone-before'], ['zoom-selected']),
        mode: 'lift',
      });

      expect(result.rippleRange).toBeNull();
      expect(result.composition.clips.map((clip) => clip.id).sort()).toEqual(
        ['screen-after', 'camera-after', 'microphone-after'].sort(),
      );
      expect(result.composition.clips.map((clip) => clip.timelineStartMs)).toEqual([2_000, 2_000, 2_000]);
      expect(result.zoomElements.map((entry) => entry.id)).toEqual(['zoom-after']);
      expect(result.zoomElements[0]).toMatchObject({ startMs: 3_000, endMs: 3_500 });
    });

    it('ripples the aligned clip envelope and keeps clips and zooms synchronized', () => {
      const { next, zoomElements } = editFixture();
      const result = deleteTimelineItems({
        composition: next,
        zoomElements,
        selection: selection(['screen-before', 'camera-before', 'microphone-before'], ['zoom-selected']),
        mode: 'ripple',
      });

      expect(result.rippleRange).toEqual({ startMs: 0, endMs: 2_000 });
      expect(result.composition.clips.map((clip) => clip.id).sort()).toEqual(
        ['screen-after', 'camera-after', 'microphone-after'].sort(),
      );
      expect(result.composition.clips.map((clip) => clip.timelineStartMs)).toEqual([0, 0, 0]);
      expect(result.zoomElements).toEqual([{ ...zoom('zoom-after', 1_000, 1_500) }]);
    });

    it('uses smart deletion as ripple at the beginning and lift away from the beginning', () => {
      const initial = editFixture();
      const ripple = deleteTimelineItems({
        composition: initial.next,
        zoomElements: initial.zoomElements,
        selection: selection(['screen-before', 'camera-before', 'microphone-before']),
        mode: 'smart',
      });
      expect(ripple.rippleRange).toEqual({ startMs: 0, endMs: 2_000 });
      expect(clipAt(ripple.composition, 'screen-after').timelineStartMs).toBe(0);

      const nonZero = composition([
        visualClip('middle', { timelineStartMs: 2_000, trackId: 'middle-track' }),
        visualClip('after', { timelineStartMs: 4_000, trackId: 'middle-track' }),
      ]);
      const lift = deleteTimelineItems({
        composition: nonZero,
        zoomElements: [zoom('after-zoom', 4_500, 5_000)],
        selection: selection(['middle']),
        mode: 'smart',
      });

      expect(lift.rippleRange).toBeNull();
      expect(clipAt(lift.composition, 'after').timelineStartMs).toBe(4_000);
      expect(lift.zoomElements[0]).toMatchObject({ startMs: 4_500, endMs: 5_000 });
    });
  });

  describe('shiftTimelineSelection', () => {
    const shiftFixture = () => ({
      composition: composition([
        visualClip('screen', { timelineStartMs: 1_200, trackId: 'screen-track' }),
        audioClip('microphone', { timelineStartMs: 1_700 }),
      ]),
      zoomElements: [zoom('zoom', 1_800, 2_300)],
    });

    it('moves selected clips and zooms by the same delta while preserving offsets', () => {
      const fixture = shiftFixture();
      const result = shiftTimelineSelection({
        ...fixture,
        selection: selection(['screen', 'microphone'], ['zoom']),
        deltaMs: 500,
      });

      expect(result.deltaMs).toBe(500);
      expect(clipAt(result.composition, 'screen').timelineStartMs).toBe(1_700);
      expect(clipAt(result.composition, 'microphone').timelineStartMs).toBe(2_200);
      expect(result.zoomElements[0]).toMatchObject({ startMs: 2_300, endMs: 2_800 });
      expect(
        clipAt(result.composition, 'microphone').timelineStartMs - clipAt(result.composition, 'screen').timelineStartMs,
      ).toBe(500);
    });

    it('clamps a negative shift so no selected item starts before zero', () => {
      const fixture = shiftFixture();
      const result = shiftTimelineSelection({
        ...fixture,
        selection: selection(['screen', 'microphone'], ['zoom']),
        deltaMs: -5_000,
      });

      expect(result.deltaMs).toBe(-1_200);
      expect(clipAt(result.composition, 'screen').timelineStartMs).toBe(0);
      expect(clipAt(result.composition, 'microphone').timelineStartMs).toBe(500);
      expect(result.zoomElements[0]).toMatchObject({ startMs: 600, endMs: 1_100 });
    });

    it('expands a selected clip to every member of its linked group', () => {
      const next = composition([
        visualClip('screen', { timelineStartMs: 1_000, trackId: 'screen-track', groupId: 'recording' }),
        audioClip('microphone', { timelineStartMs: 1_000, groupId: 'recording' }),
      ]);

      const result = shiftTimelineSelection({
        composition: next,
        zoomElements: [],
        selection: selection(['screen']),
        deltaMs: 750,
      });

      expect(clipAt(result.composition, 'screen').timelineStartMs).toBe(1_750);
      expect(clipAt(result.composition, 'microphone').timelineStartMs).toBe(1_750);
    });
  });
});
