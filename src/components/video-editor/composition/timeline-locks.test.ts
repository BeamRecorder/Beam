import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_SCHEMA_VERSION,
  type Clip,
  type ClipComposition,
  type MediaAsset,
} from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { TimelineSelectionIds } from './timeline-edit-types';
import {
  lockedTimelineSelection,
  preservesLockedAssets,
  preservesLockedItems,
  selectionHasLocks,
  setTimelineLocks,
} from './timeline-locks';

interface ClipLockOverrides {
  assetId?: string;
  groupId?: string;
  locked?: boolean;
  name?: string;
  order?: number;
}

const clip = (id: string, overrides: ClipLockOverrides = {}): Clip =>
  ({
    id,
    kind: 'video',
    name: id,
    assetId: `${id}-asset`,
    timelineStartMs: 1_000,
    timelineDurationMs: 2_000,
    order: 0,
    ...overrides,
  }) as Clip;

const asset = (id: string, overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  fileName: `${id}.mp4`,
  durationMs: 2_000,
  width: 1_920,
  height: 1_080,
  src: `/media/${id}`,
  origin: 'project',
  ...overrides,
});

const zoom = (id: string, locked = false): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs: 1_000,
  endMs: 2_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
  ...(locked ? { locked: true } : {}),
});

const composition = (clips: Clip[], assets: MediaAsset[] = []): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets,
  clips,
  keyboardCaptionSessions: [],
});

const selection = (clipIds: string[] = [], zoomIds: string[] = []): TimelineSelectionIds => ({ clipIds, zoomIds });

describe('timeline locks', () => {
  describe('preservesLockedItems', () => {
    it('rejects changed or removed locked content while allowing order and lock changes', () => {
      const locked = clip('locked', { locked: true, order: 2 });
      const free = clip('free', { order: 3 });

      expect(preservesLockedItems([locked], [{ ...locked, name: 'changed' }])).toBe(false);
      expect(preservesLockedItems([locked], [])).toBe(false);
      expect(preservesLockedItems([locked], [{ ...locked, locked: false, order: 8 }])).toBe(true);
      expect(
        preservesLockedItems(
          [locked, free],
          [
            { ...locked, order: 9 },
            { ...free, name: 'edited', order: 10 },
          ],
        ),
      ).toBe(true);
      expect(preservesLockedItems([locked], [locked])).toBe(true);
      expect(preservesLockedItems([free], [])).toBe(true);
    });

    it('allows a renumbered order only when locked items keep their relative position', () => {
      const locked = clip('locked', { locked: true, order: 1 });
      const free = clip('free', { order: 2 });

      expect(
        preservesLockedItems(
          [locked, free],
          [
            { ...locked, order: 10 },
            { ...free, order: 11 },
          ],
        ),
      ).toBe(true);
      expect(
        preservesLockedItems(
          [locked, free],
          [
            { ...locked, order: 10 },
            { ...free, order: 1 },
          ],
        ),
      ).toBe(false);
    });
  });

  describe('preservesLockedAssets', () => {
    it('blocks replacing or removing an asset referenced by locked content', () => {
      const protectedAsset = asset('locked-asset');
      const freeAsset = asset('free-asset');
      const before = composition(
        [clip('locked', { locked: true }), clip('free', { assetId: 'free-asset' })],
        [protectedAsset, freeAsset],
      );

      const replaced = {
        ...before,
        assets: before.assets.map((entry) => (entry.id === protectedAsset.id ? { ...entry, name: 'replaced' } : entry)),
      };
      const removed = { ...before, assets: before.assets.filter((entry) => entry.id !== protectedAsset.id) };
      const unrelatedEdit = {
        ...before,
        assets: before.assets.map((entry) => (entry.id === freeAsset.id ? { ...entry, name: 'edited' } : entry)),
      };

      expect(preservesLockedAssets(before, replaced)).toBe(false);
      expect(preservesLockedAssets(before, removed)).toBe(false);
      expect(preservesLockedAssets(before, unrelatedEdit)).toBe(true);
      expect(preservesLockedAssets(before, before)).toBe(true);
      expect(preservesLockedAssets(composition([clip('free')], [asset('free-asset')]), composition([], []))).toBe(true);
    });

    it('allows derived audio analysis caches while protecting the source asset fields', () => {
      const protectedAsset = asset('locked-asset', { audioAnalyses: [] });
      const before = composition([clip('locked', { locked: true })], [protectedAsset]);
      const analysis = {
        version: 1,
        key: 'analysis-key',
        rangeStartMs: 0,
        rangeDurationMs: 2_000,
        sampleRate: 48_000,
        channels: 2,
        integratedLufs: -16,
        samplePeakDbfs: -1,
        truePeakDbtp: -1,
      };
      const withCache = {
        ...before,
        assets: [{ ...protectedAsset, audioAnalyses: [analysis] }],
      };
      const sourceChanged = {
        ...withCache,
        assets: [{ ...withCache.assets[0]!, src: '/media/replaced' }],
      };

      expect(preservesLockedAssets(before, withCache)).toBe(true);
      expect(preservesLockedAssets(before, sourceChanged)).toBe(false);
    });
  });

  describe('selectionHasLocks', () => {
    it('finds a locked group member when another member is selected', () => {
      const next = composition([
        clip('group-screen', { groupId: 'recording' }),
        clip('group-camera', { groupId: 'recording', locked: true }),
        clip('locked-direct', { locked: true }),
        clip('free'),
      ]);
      const zooms = [zoom('locked-zoom', true), zoom('free-zoom')];

      expect(selectionHasLocks(next, zooms, selection(['group-screen']))).toBe(true);
      expect(selectionHasLocks(next, zooms, selection(['free'], ['locked-zoom']))).toBe(true);
      expect(selectionHasLocks(next, zooms, selection(['free'], ['free-zoom']))).toBe(false);
      expect(selectionHasLocks(next, zooms, selection(['locked-direct']))).toBe(true);
      expect(selectionHasLocks(next, zooms, selection(['missing']))).toBe(false);
    });
  });

  describe('setTimelineLocks', () => {
    it('updates mixed clip and zoom selections while preserving unrelated references', () => {
      const locked = clip('already-locked', { locked: true });
      const selectedClip = clip('selected-clip');
      const groupMember = clip('group-member', { groupId: 'group', locked: true });
      const next = composition([locked, selectedClip, groupMember]);
      const lockedZoom = zoom('already-locked-zoom', true);
      const selectedZoom = zoom('selected-zoom');
      const zooms = [lockedZoom, selectedZoom];

      const result = setTimelineLocks(next, zooms, {
        clipIds: ['selected-clip', 'stale-clip'],
        zoomIds: ['selected-zoom', 'stale-zoom'],
        locked: true,
      });

      expect(result.composition).not.toBe(next);
      expect(result.composition.clips).not.toBe(next.clips);
      expect(result.composition.assets).toBe(next.assets);
      expect(result.composition.clips[0]).toBe(locked);
      expect(result.composition.clips[1]).not.toBe(selectedClip);
      expect(result.composition.clips[1]).toMatchObject({ id: 'selected-clip', locked: true });
      expect(result.composition.clips[2]).toBe(groupMember);
      expect(result.zoomElements).not.toBe(zooms);
      expect(result.zoomElements[0]).toBe(lockedZoom);
      expect(result.zoomElements[1]).not.toBe(selectedZoom);
      expect(result.zoomElements[1]).toMatchObject({ id: 'selected-zoom', locked: true });

      const unlocked = setTimelineLocks(result.composition, result.zoomElements, {
        clipIds: ['selected-clip', 'group-member'],
        zoomIds: ['already-locked-zoom'],
        locked: false,
      });
      expect(unlocked.composition.clips[1]).toMatchObject({ id: 'selected-clip', locked: false });
      expect(unlocked.composition.clips[2]).toMatchObject({ id: 'group-member', locked: false });
      expect(unlocked.zoomElements[0]).toMatchObject({ id: 'already-locked-zoom', locked: false });
      expect(unlocked.zoomElements[1]).toBe(result.zoomElements[1]);
    });

    it('expands a selected clip to every member of its linked group', () => {
      const selected = clip('group-selected', { groupId: 'recording' });
      const companion = clip('group-companion', { groupId: 'recording' });
      const next = composition([selected, companion]);

      const result = setTimelineLocks(next, [], {
        clipIds: ['group-selected'],
        zoomIds: [],
        locked: true,
      });

      expect(result.composition.clips).toEqual([
        expect.objectContaining({ id: 'group-selected', locked: true }),
        expect.objectContaining({ id: 'group-companion', locked: true }),
      ]);
    });
  });
});

describe('locked selection targets', () => {
  it('returns only actual locked members of a mixed selection', () => {
    const state = composition([clip('blur', { locked: true }), clip('color'), clip('outside', { locked: true })]);
    expect(
      lockedTimelineSelection(
        state,
        [zoom('locked', true), zoom('free')],
        selection(['blur', 'color', 'missing'], ['locked', 'free', 'missing']),
      ),
    ).toEqual(selection(['blur'], ['locked']));
  });
  it('identifies the locked linked companion without naming its free selected partner', () => {
    const state = composition([clip('free', { groupId: 'g' }), clip('locked', { groupId: 'g', locked: true })]);
    expect(lockedTimelineSelection(state, [], selection(['free']))).toEqual(selection(['locked']));
  });
  it('clears the locked subset when only free or stale items are selected', () => {
    const state = composition([clip('free'), clip('locked', { locked: true })]);
    expect(lockedTimelineSelection(state, [zoom('outside', true)], selection(['free', 'gone']))).toEqual(selection());
    expect(lockedTimelineSelection(state, [], selection())).toEqual(selection());
  });
  it('does not add lock flags or replace free records when unlocking a group', () => {
    const free = clip('free', { groupId: 'g' });
    const unlockedZoom = zoom('free-zoom');
    const state = composition([free, clip('locked', { groupId: 'g', locked: true })]);
    const result = setTimelineLocks(state, [unlockedZoom], { ...selection(['locked'], ['free-zoom']), locked: false });
    expect(result.composition.clips[0]).toBe(free);
    expect(result.composition.clips[0]).not.toHaveProperty('locked');
    expect(result.composition.clips[1]?.locked).toBe(false);
    expect(result.zoomElements[0]).toBe(unlockedZoom);
  });
});
