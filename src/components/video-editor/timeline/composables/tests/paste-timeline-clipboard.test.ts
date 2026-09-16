import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPOSITION_SCHEMA_VERSION,
  type CaptionClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ZoomElement } from '../../../zoom/zoom-types';
import { pasteTimelineClipboard } from '../paste-timeline-clipboard';
import { useTimelineClipboard } from '../useTimelineClipboard';

const mediaAsset = (id: string): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  fileName: `${id}.mp4`,
  durationMs: 10_000,
  width: 1_280,
  height: 720,
  src: `/media/${id}.mp4`,
  origin: 'project',
});

const visual = (overrides: Partial<VisualClip>): VisualClip => {
  const kind = overrides.kind ?? 'screen';
  return {
    id: 'visual',
    kind,
    name: 'Screen recording',
    assetId: 'screen-asset',
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    trackId: 'screen-track',
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance(kind),
    isMirrored: false,
    isMirroredY: false,
    ...(kind === 'webcam'
      ? {
          cameraLayoutPreset: 'floating-bottom-right' as const,
          cameraFramingPreset: 'squircle' as const,
          cameraSplitRatio: 0.5,
          cameraSplitPadding: 0,
        }
      : {}),
    ...overrides,
  };
};

const zoom = (id: string, startMs: number, endMs: number): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs,
  endMs,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
});

const composition = (clips: Clip[], assets: MediaAsset[]): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets,
  clips,
  keyboardCaptionSessions: [],
});

const copySelection = (clips: Clip[], zooms: ZoomElement[], assets: MediaAsset[], primaryId: string | null) => {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const item = useTimelineClipboard().copySelection({
    scopeId: 'project-a',
    clips,
    zooms,
    allZooms: zooms,
    primaryId,
    assetFor: (clip) => ('assetId' in clip ? (assetsById.get(clip.assetId) ?? null) : null),
  });
  if (!item) throw new Error('Expected a copied timeline selection');
  return item;
};

const caption = (id: string, layerId: string, timelineStartMs: number, text: string, order = 0): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  timelineStartMs,
  timelineDurationMs: 500,
  sourceInMs: 0,
  sourceDurationMs: 500,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order,
  captionLayerId: layerId,
  caption: {
    type: 'text',
    sentences: [{ id: `${id}-sentence`, text, startMs: 0, endMs: 500, words: [] }],
    style: { ...createDefaultCaptionStyle(), customText: text },
  },
});

const queuedIds = (ids: string[]) => () => {
  const id = ids.shift();
  if (!id) throw new Error('No more deterministic IDs are available.');
  return id;
};

afterEach(() => useTimelineClipboard().clearClipboard());

describe('pasteTimelineClipboard', () => {
  it('pastes caption fragments together on a new layer without changing source or neighboring layers', () => {
    const sourceCollision = caption('source-at-paste', 'source-caption-layer', 500, 'Source at paste position', 2);
    const firstFragment = caption('source-caption-first', 'source-caption-layer', 1_000, 'First fragment', 2);
    const secondFragment = caption('source-caption-second', 'source-caption-layer', 2_500, 'Second fragment', 2);
    const neighboringLayer = caption('neighbor-caption', 'neighbor-caption-layer', 500, 'Neighbor stays');
    const sourceClips = [sourceCollision, firstFragment, secondFragment, neighboringLayer];
    const source = composition(sourceClips, []);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
    const item = copySelection([firstFragment, secondFragment], [], [], firstFragment.id);
    const ids = ['pasted-caption-layer', 'pasted-caption-first', 'pasted-caption-second'];

    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item,
      timeMs: 500,
      timelineDurationMs: 5_000,
      target: { category: 'caption', placement: 'new-layer' },
      idFactory: queuedIds(ids),
    });

    const pasted = result.composition.clips.filter(
      (clip): clip is CaptionClip => clip.kind === 'caption' && clip.id.startsWith('pasted-caption-'),
    );
    expect(result.clipIds).toEqual(['pasted-caption-first', 'pasted-caption-second']);
    expect(pasted).toMatchObject([
      {
        id: 'pasted-caption-first',
        timelineStartMs: 500,
        captionLayerId: 'pasted-caption-layer',
      },
      {
        id: 'pasted-caption-second',
        timelineStartMs: 2_000,
        captionLayerId: 'pasted-caption-layer',
      },
    ]);
    expect(
      result.composition.clips.filter(
        (clip): clip is CaptionClip => clip.kind === 'caption' && clip.captionLayerId === 'source-caption-layer',
      ),
    ).toEqual(sourceClips.filter((clip) => clip.captionLayerId === 'source-caption-layer'));
    expect(result.composition.clips.find((clip) => clip.id === neighboringLayer.id)).toEqual(neighboringLayer);
    expect(source).toEqual(before);
    expect(ids).toHaveLength(0);
  });

  it('pastes a mixed selection at relative offsets on new tracks grouped by source track', () => {
    const screenAsset = mediaAsset('screen-asset');
    const webcamAsset = mediaAsset('webcam-asset');
    const sourceClips = [
      visual({
        id: 'screen-early',
        trackId: 'source-screen-track',
        timelineStartMs: 1_000,
      }),
      visual({
        id: 'screen-late',
        trackId: 'source-screen-track',
        timelineStartMs: 2_000,
      }),
      visual({
        id: 'webcam-overlay',
        kind: 'webcam',
        assetId: webcamAsset.id,
        trackId: 'source-webcam-track',
        timelineStartMs: 4_000,
        timelineDurationMs: 500,
        sourceDurationMs: 500,
        order: 1,
      }),
    ];
    const source = composition(sourceClips, [screenAsset, webcamAsset]);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
    const copiedZoom = zoom('copied-zoom', 2_500, 3_000);
    const item = copySelection(sourceClips, [copiedZoom], [screenAsset, webcamAsset], copiedZoom.id);
    const ids = [
      'new-screen-layer',
      'pasted-screen-early',
      'pasted-screen-late',
      'new-webcam-layer',
      'pasted-webcam',
      'pasted-zoom',
    ];

    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item,
      timeMs: 500,
      timelineDurationMs: 6_000,
      target: {
        category: 'visual',
        trackId: 'source-screen-track',
        placement: 'new-layer',
      },
      idFactory: queuedIds(ids),
    });

    const pasted = new Map(result.composition.clips.map((clip) => [clip.id, clip]));
    expect(result.clipIds).toEqual(['pasted-screen-early', 'pasted-screen-late', 'pasted-webcam']);
    expect(result.zoomIds).toEqual(['pasted-zoom']);
    expect(result.primary).toEqual({ type: 'zoom', id: 'pasted-zoom' });
    expect(pasted.get('pasted-screen-early')).toMatchObject({
      timelineStartMs: 500,
      trackId: 'new-screen-layer',
    });
    expect(pasted.get('pasted-screen-late')).toMatchObject({
      timelineStartMs: 1_500,
      trackId: 'new-screen-layer',
    });
    expect(pasted.get('pasted-webcam')).toMatchObject({
      timelineStartMs: 3_500,
      trackId: 'new-webcam-layer',
    });
    expect(result.zoomElements).toEqual([
      expect.objectContaining({
        id: 'pasted-zoom',
        startMs: 2_000,
        endMs: 2_500,
      }),
    ]);
    expect(pasted.get('screen-early')).toMatchObject({
      timelineStartMs: 1_000,
      trackId: 'source-screen-track',
    });
    expect(pasted.get('webcam-overlay')).toMatchObject({
      timelineStartMs: 4_000,
      trackId: 'source-webcam-track',
    });
    expect(source).toEqual(before);
    expect(ids).toHaveLength(0);
  });

  it('keeps targeted paste on the requested track and overwrites only that lane', () => {
    const screenAsset = mediaAsset('screen-asset');
    const copyAsset = mediaAsset('copy-asset');
    const target = visual({
      id: 'target-existing',
      trackId: 'target-track',
      timelineDurationMs: 1_500,
      sourceDurationMs: 1_500,
    });
    const copied = visual({
      id: 'source-copy',
      assetId: copyAsset.id,
      trackId: 'source-track',
      timelineStartMs: 2_000,
      timelineDurationMs: 500,
      sourceDurationMs: 500,
      order: 1,
    });
    const source = composition([target, copied], [screenAsset, copyAsset]);
    const item = copySelection([copied], [], [screenAsset, copyAsset], copied.id);

    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item,
      timeMs: 500,
      timelineDurationMs: 3_000,
      target: { category: 'visual', trackId: 'target-track' },
      idFactory: queuedIds(['pasted-copy', 'target-right-fragment']),
    });

    const targetLane = result.composition.clips
      .filter((clip) => clip.trackId === 'target-track')
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs)
      .map((clip) => [clip.id, clip.timelineStartMs, clip.timelineDurationMs]);
    expect(targetLane).toEqual([
      ['target-existing', 0, 500],
      ['pasted-copy', 500, 500],
      ['target-right-fragment', 1_000, 500],
    ]);
    expect(result.composition.clips.find((clip) => clip.id === 'pasted-copy')).toMatchObject({
      assetId: 'copy-asset',
      trackId: 'target-track',
    });
    expect(result.composition.clips.find((clip) => clip.id === 'source-copy')).toMatchObject({
      timelineStartMs: 2_000,
      trackId: 'source-track',
    });
  });

  it('does not mutate either timeline when a later bundle entry cannot fit', () => {
    const screenAsset = mediaAsset('screen-asset');
    const first = visual({
      id: 'first',
      trackId: 'source-track',
      timelineStartMs: 0,
      timelineDurationMs: 500,
      sourceDurationMs: 500,
    });
    const tooLate = visual({
      id: 'too-late',
      trackId: 'source-track',
      timelineStartMs: 3_000,
      timelineDurationMs: 500,
      sourceDurationMs: 500,
    });
    const source = composition([], [screenAsset]);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
    const sourceZooms = [zoom('existing-zoom', 0, 500)];
    const beforeZooms = JSON.parse(JSON.stringify(sourceZooms)) as ZoomElement[];
    const originalZoom = sourceZooms[0];
    const item = copySelection([first, tooLate], [], [screenAsset], first.id);

    expect(() =>
      pasteTimelineClipboard({
        composition: source,
        zoomElements: sourceZooms,
        item,
        timeMs: 8_000,
        timelineDurationMs: 10_000,
        target: { category: 'visual', placement: 'new-layer' },
        idFactory: queuedIds(['new-layer', 'pasted-first']),
      }),
    ).toThrow('The copied item does not fit at the playhead.');

    expect(source).toEqual(before);
    expect(sourceZooms).toEqual(beforeZooms);
    expect(sourceZooms[0]).toBe(originalZoom);
  });
});
