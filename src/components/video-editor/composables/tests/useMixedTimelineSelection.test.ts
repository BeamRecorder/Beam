import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPOSITION_SCHEMA_VERSION, type ClipComposition, type VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ZoomElement } from '../../zoom/zoom-types';
import { useMixedTimelineSelection } from '../useMixedTimelineSelection';

const clip = (id: string, timelineStartMs: number): VisualClip => ({
  id,
  kind: 'screen',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});

const zoom = (id: string, startMs: number): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs,
  endMs: startMs + 1_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

const makeComposition = (clips: VisualClip[]): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [],
  clips,
  keyboardCaptionSessions: [],
});

const createSelection = ({
  clips = [clip('clip-1', 1_000), clip('clip-2', 5_000)],
  zooms = [zoom('zoom-1', 3_000), zoom('zoom-2', 7_000)],
}: {
  clips?: VisualClip[];
  zooms?: ZoomElement[];
} = {}) => {
  const composition = ref(makeComposition(clips));
  const zoomElements = ref(zooms);
  const selectedClipId = ref<string | null>(null);
  const selectedClipIds = ref<string[]>([]);
  const selectedZoomId = ref<string | null>(null);
  const selectedZoomIds = ref<string[]>([]);
  const activeTab = ref('canvas');
  const openPropertiesPanel = vi.fn();

  return {
    state: useMixedTimelineSelection({
      composition,
      zoomElements,
      selectedClipId,
      selectedClipIds,
      selectedZoomId,
      selectedZoomIds,
      activeTab,
      openPropertiesPanel,
    }),
    selectedClipId,
    selectedClipIds,
    selectedZoomId,
    selectedZoomIds,
    activeTab,
    openPropertiesPanel,
  };
};

afterEach(() => vi.restoreAllMocks());

describe('useMixedTimelineSelection', () => {
  it('replaces the complete mixed selection and updates the primary tab', () => {
    const selection = createSelection();

    selection.state.selectItem({ kind: 'clip', id: 'clip-1', intent: 'replace' });
    expect(selection.selectedClipIds.value).toEqual(['clip-1']);
    expect(selection.selectedZoomIds.value).toEqual([]);
    expect(selection.selectedClipId.value).toBe('clip-1');
    expect(selection.selectedZoomId.value).toBeNull();
    expect(selection.activeTab.value).toBe('clip');

    selection.state.selectItem({ kind: 'zoom', id: 'zoom-1', intent: 'replace' });
    expect(selection.selectedClipIds.value).toEqual([]);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-1']);
    expect(selection.selectedClipId.value).toBeNull();
    expect(selection.selectedZoomId.value).toBe('zoom-1');
    expect(selection.activeTab.value).toBe('zoom');
    expect(selection.openPropertiesPanel).toHaveBeenCalledTimes(2);
  });

  it('toggles clips and zooms without losing the other category', () => {
    const selection = createSelection();
    selection.state.selectItem({ kind: 'clip', id: 'clip-1', intent: 'replace' });

    selection.state.selectItem({ kind: 'zoom', id: 'zoom-1', intent: 'toggle' });
    selection.state.selectItem({ kind: 'clip', id: 'clip-2', intent: 'toggle' });
    expect(selection.selectedClipIds.value).toEqual(['clip-1', 'clip-2']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-1']);
    expect(selection.selectedClipId.value).toBe('clip-2');
    expect(selection.selectedZoomId.value).toBe('zoom-1');

    selection.state.selectItem({ kind: 'clip', id: 'clip-1', intent: 'toggle' });
    expect(selection.selectedClipIds.value).toEqual(['clip-2']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-1']);
    expect(selection.selectedClipId.value).toBe('clip-2');
    expect(selection.selectedZoomId.value).toBe('zoom-1');
  });

  it('selects every item between a clip anchor and a zoom target by time', () => {
    const selection = createSelection({
      clips: [clip('clip-early', 1_000), clip('clip-middle', 5_000), clip('clip-late', 9_000)],
      zooms: [zoom('zoom-early', 3_000), zoom('zoom-target', 7_000)],
    });

    selection.state.selectItem({ kind: 'clip', id: 'clip-early', intent: 'replace' });
    selection.state.selectItem({ kind: 'zoom', id: 'zoom-target', intent: 'range' });

    expect(selection.selectedClipIds.value).toEqual(['clip-early', 'clip-middle']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-early', 'zoom-target']);
    expect(selection.selectedClipId.value).toBe('clip-early');
    expect(selection.selectedZoomId.value).toBe('zoom-target');
    expect(selection.activeTab.value).toBe('zoom');
  });

  it('selects all clips and zooms in chronological order with the earliest item primary', () => {
    const selection = createSelection({
      clips: [clip('clip-late', 5_000), clip('clip-early', 1_000)],
      zooms: [zoom('zoom-middle', 3_000)],
    });

    selection.state.selectAll();

    expect(selection.selectedClipIds.value).toEqual(['clip-early', 'clip-late']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-middle']);
    expect(selection.selectedClipId.value).toBe('clip-early');
    expect(selection.selectedZoomId.value).toBe('zoom-middle');
    expect(selection.activeTab.value).toBe('clip');
  });

  it('clears both categories and resets the range anchor', () => {
    const selection = createSelection();
    selection.state.selectItem({ kind: 'clip', id: 'clip-1', intent: 'replace' });
    selection.state.selectItem({ kind: 'zoom', id: 'zoom-1', intent: 'toggle' });

    selection.state.clearAll();

    expect(selection.selectedClipIds.value).toEqual([]);
    expect(selection.selectedZoomIds.value).toEqual([]);
    expect(selection.selectedClipId.value).toBeNull();
    expect(selection.selectedZoomId.value).toBeNull();

    selection.state.selectItem({ kind: 'clip', id: 'clip-2', intent: 'range' });
    expect(selection.selectedClipIds.value).toEqual(['clip-2']);
    expect(selection.selectedZoomIds.value).toEqual([]);
  });

  it('replaces selection from a track and merges both categories in additive mode', () => {
    const selection = createSelection();
    selection.state.selectItem({ kind: 'zoom', id: 'zoom-1', intent: 'replace' });

    selection.state.selectClipTrack({
      clipIds: ['clip-1'],
      primaryClipId: 'clip-1',
      trackNames: ['Screen'],
    });
    expect(selection.selectedClipIds.value).toEqual(['clip-1']);
    expect(selection.selectedZoomIds.value).toEqual([]);
    expect(selection.selectedClipId.value).toBe('clip-1');
    expect(selection.selectedZoomId.value).toBeNull();

    selection.state.selectItem({ kind: 'zoom', id: 'zoom-1', intent: 'toggle' });
    selection.state.selectClipTrack({
      clipIds: ['clip-2'],
      primaryClipId: 'clip-2',
      trackNames: ['Camera'],
      additive: true,
    });
    expect(selection.selectedClipIds.value).toEqual(['clip-1', 'clip-2']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-1']);
    expect(selection.selectedClipId.value).toBe('clip-2');

    selection.state.selectZoomTrack({
      zoomIds: ['zoom-2'],
      primaryZoomId: 'zoom-2',
      additive: true,
    });
    expect(selection.selectedClipIds.value).toEqual(['clip-1', 'clip-2']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-1', 'zoom-2']);
    expect(selection.selectedZoomId.value).toBe('zoom-2');
    expect(selection.openPropertiesPanel).toHaveBeenCalledTimes(5);
  });

  it('filters and deduplicates box selections, chooses a clip primary, and updates the range anchor', () => {
    const selection = createSelection();

    selection.state.selectBox({
      clipIds: ['missing-clip', 'clip-2', 'clip-2'],
      zoomIds: ['missing-zoom', 'zoom-1', 'zoom-1'],
    });

    expect(selection.selectedClipIds.value).toEqual(['clip-2']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-1']);
    expect(selection.selectedClipId.value).toBe('clip-2');
    expect(selection.selectedZoomId.value).toBe('zoom-1');
    expect(selection.activeTab.value).toBe('clip');

    selection.state.selectItem({ kind: 'zoom', id: 'zoom-2', intent: 'range' });
    expect(selection.selectedClipIds.value).toEqual(['clip-2']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-2']);
    expect(selection.selectedClipId.value).toBe('clip-2');
    expect(selection.selectedZoomId.value).toBe('zoom-2');

    selection.state.selectBox({ clipIds: ['missing-clip'], zoomIds: ['missing-zoom'] });
    expect(selection.selectedClipIds.value).toEqual([]);
    expect(selection.selectedZoomIds.value).toEqual([]);
    expect(selection.selectedClipId.value).toBeNull();
    expect(selection.selectedZoomId.value).toBeNull();
  });

  it('falls back to a zoom target when a range selection has no anchor', () => {
    const selection = createSelection();

    selection.state.selectItem({ kind: 'zoom', id: 'zoom-2', intent: 'range' });

    expect(selection.selectedClipIds.value).toEqual([]);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-2']);
    expect(selection.selectedClipId.value).toBeNull();
    expect(selection.selectedZoomId.value).toBe('zoom-2');
    expect(selection.activeTab.value).toBe('zoom');
  });

  it('orders tied items by kind and id and handles an empty select-all', () => {
    const selection = createSelection({
      clips: [clip('clip-b', 1_000), clip('clip-a', 1_000)],
      zooms: [zoom('zoom-b', 1_000), zoom('zoom-a', 1_000)],
    });

    selection.state.selectAll();

    expect(selection.selectedClipIds.value).toEqual(['clip-a', 'clip-b']);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-a', 'zoom-b']);
    expect(selection.selectedClipId.value).toBe('clip-a');
    expect(selection.activeTab.value).toBe('clip');

    const empty = createSelection({ clips: [], zooms: [] });
    empty.state.selectAll();

    expect(empty.selectedClipIds.value).toEqual([]);
    expect(empty.selectedZoomIds.value).toEqual([]);
    expect(empty.selectedClipId.value).toBeNull();
    expect(empty.selectedZoomId.value).toBeNull();
    expect(empty.activeTab.value).toBe('canvas');
  });

  it('keeps track selections usable when no primary item is supplied', () => {
    const clips = createSelection();

    clips.state.selectClipTrack({ clipIds: ['clip-1'], primaryClipId: null, trackNames: ['Screen'] });

    expect(clips.selectedClipIds.value).toEqual(['clip-1']);
    expect(clips.selectedClipId.value).toBe('clip-1');
    expect(clips.activeTab.value).toBe('canvas');

    const zooms = createSelection();
    zooms.state.selectZoomTrack({ zoomIds: ['zoom-2'], primaryZoomId: null });

    expect(zooms.selectedClipIds.value).toEqual([]);
    expect(zooms.selectedZoomIds.value).toEqual(['zoom-2']);
    expect(zooms.selectedZoomId.value).toBe('zoom-2');
    expect(zooms.activeTab.value).toBe('canvas');
  });

  it('selects a zoom-only box and uses it as the primary item', () => {
    const selection = createSelection();

    selection.state.selectBox({ clipIds: [], zoomIds: ['zoom-2'] });

    expect(selection.selectedClipIds.value).toEqual([]);
    expect(selection.selectedZoomIds.value).toEqual(['zoom-2']);
    expect(selection.selectedClipId.value).toBeNull();
    expect(selection.selectedZoomId.value).toBe('zoom-2');
    expect(selection.activeTab.value).toBe('zoom');
  });
});
