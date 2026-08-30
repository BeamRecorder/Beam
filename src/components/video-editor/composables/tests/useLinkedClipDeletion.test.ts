import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from '../../composition/engine/clip-engine';
import type { ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import { useLinkedClipDeletion } from '../useLinkedClipDeletion';

const asset = (id: string): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  fileName: `${id}.mp4`,
  durationMs: 10_000,
  width: 1_920,
  height: 1_080,
  src: `/media/${id}.mp4`,
  origin: 'project',
});

const clip = (id: string, timelineStartMs: number, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs,
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

const composition = (clips: VisualClip[]): ClipComposition =>
  createComposition(
    clips.map((entry) => asset(entry.assetId)),
    clips,
  );

const zoom = (id: string, startMs: number, endMs: number): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs,
  endMs,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

const createDeletion = ({
  clips,
  zoomElements = [],
  selectedClipId = null,
  selectedClipIds = [],
  selectedZoomId = null,
  selectedZoomIds = [],
}: {
  clips: VisualClip[];
  zoomElements?: ZoomElement[];
  selectedClipId?: string | null;
  selectedClipIds?: string[];
  selectedZoomId?: string | null;
  selectedZoomIds?: string[];
}) => {
  const compositionRef = ref(composition(clips));
  const zoomElementsRef = ref(zoomElements);
  const selectedClipIdRef = ref(selectedClipId);
  const selectedClipIdsRef = ref(selectedClipIds);
  const selectedZoomIdRef = ref(selectedZoomId);
  const selectedZoomIdsRef = ref(selectedZoomIds);
  const onCommit = vi.fn();

  return {
    state: useLinkedClipDeletion({
      composition: compositionRef,
      selectedClipId: selectedClipIdRef,
      selectedClipIds: selectedClipIdsRef,
      zoomElements: zoomElementsRef,
      selectedZoomId: selectedZoomIdRef,
      selectedZoomIds: selectedZoomIdsRef,
      onCommit,
    }),
    composition: compositionRef,
    zoomElements: zoomElementsRef,
    selectedClipId: selectedClipIdRef,
    selectedClipIds: selectedClipIdsRef,
    selectedZoomId: selectedZoomIdRef,
    selectedZoomIds: selectedZoomIdsRef,
    onCommit,
  };
};

const clipAt = (value: ClipComposition, id: string) => value.clips.find((entry) => entry.id === id);

afterEach(() => vi.restoreAllMocks());

describe('useLinkedClipDeletion', () => {
  it('smart-deletes an aligned initial range and shifts following clips and zooms once', () => {
    const deletion = createDeletion({
      clips: [
        clip('initial-screen', 0, { trackId: 'screen-track' }),
        clip('following-screen', 2_000, { trackId: 'screen-track' }),
      ],
      zoomElements: [zoom('following-zoom', 3_000, 3_500)],
      selectedClipId: 'initial-screen',
      selectedClipIds: ['initial-screen'],
    });

    deletion.state.requestTimelineDeletion({
      clipIds: ['initial-screen'],
      zoomIds: [],
      mode: 'smart',
    });

    expect(clipAt(deletion.composition.value, 'initial-screen')).toBeUndefined();
    expect(clipAt(deletion.composition.value, 'following-screen')).toMatchObject({ timelineStartMs: 0 });
    expect(deletion.zoomElements.value).toEqual([
      expect.objectContaining({ id: 'following-zoom', startMs: 1_000, endMs: 1_500 }),
    ]);
    expect(deletion.selectedClipIds.value).toEqual([]);
    expect(deletion.selectedClipId.value).toBeNull();
    expect(deletion.onCommit).toHaveBeenCalledTimes(1);
  });

  it('uses lift mode without shifting the remaining timeline', () => {
    const deletion = createDeletion({
      clips: [
        clip('initial-screen', 0, { trackId: 'screen-track' }),
        clip('following-screen', 2_000, { trackId: 'screen-track' }),
      ],
      zoomElements: [zoom('following-zoom', 3_000, 3_500)],
      selectedClipId: 'initial-screen',
      selectedClipIds: ['initial-screen'],
    });

    deletion.state.requestTimelineDeletion({
      clipIds: ['initial-screen'],
      zoomIds: [],
      mode: 'lift',
    });

    expect(clipAt(deletion.composition.value, 'initial-screen')).toBeUndefined();
    expect(clipAt(deletion.composition.value, 'following-screen')).toMatchObject({ timelineStartMs: 2_000 });
    expect(deletion.zoomElements.value).toEqual([
      expect.objectContaining({ id: 'following-zoom', startMs: 3_000, endMs: 3_500 }),
    ]);
    expect(deletion.onCommit).toHaveBeenCalledTimes(1);
  });

  it('waits for linked-group confirmation before applying smart ripple deletion', () => {
    const deletion = createDeletion({
      clips: [
        clip('linked-screen', 0, { trackId: 'screen-track', groupId: 'initial-recording' }),
        clip('linked-camera', 0, { trackId: 'camera-track', groupId: 'initial-recording' }),
        clip('following-screen', 2_000, { trackId: 'screen-track' }),
        clip('following-camera', 2_000, { trackId: 'camera-track' }),
      ],
      zoomElements: [zoom('following-zoom', 3_000, 3_500)],
      selectedClipId: 'linked-screen',
      selectedClipIds: ['linked-screen'],
    });

    deletion.state.requestTimelineDeletion({
      clipIds: ['linked-screen'],
      zoomIds: [],
      mode: 'smart',
    });

    expect(deletion.state.isDeleteDialogOpen.value).toBe(true);
    expect(deletion.state.linkedDeleteClips.value.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['linked-screen', 'linked-camera']),
    );
    expect(deletion.state.linkedDeleteClips.value).toHaveLength(2);
    expect(deletion.composition.value.clips.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['linked-screen', 'linked-camera', 'following-screen', 'following-camera']),
    );
    expect(deletion.composition.value.clips).toHaveLength(4);
    expect(deletion.onCommit).not.toHaveBeenCalled();

    deletion.state.deleteFromDialog(['linked-screen', 'linked-camera']);

    expect(clipAt(deletion.composition.value, 'linked-screen')).toBeUndefined();
    expect(clipAt(deletion.composition.value, 'linked-camera')).toBeUndefined();
    expect(clipAt(deletion.composition.value, 'following-screen')).toMatchObject({ timelineStartMs: 0 });
    expect(clipAt(deletion.composition.value, 'following-camera')).toMatchObject({ timelineStartMs: 0 });
    expect(deletion.zoomElements.value).toEqual([
      expect.objectContaining({ id: 'following-zoom', startMs: 1_000, endMs: 1_500 }),
    ]);
    expect(deletion.selectedClipIds.value).toEqual([]);
    expect(deletion.selectedClipId.value).toBeNull();
    expect(deletion.onCommit).toHaveBeenCalledTimes(1);
  });
});
