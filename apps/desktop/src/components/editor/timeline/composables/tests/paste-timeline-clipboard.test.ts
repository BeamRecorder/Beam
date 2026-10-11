import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPOSITION_SCHEMA_VERSION,
  isCaptionClip,
  type CaptionClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from '@beam/engine/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { pasteTimelineClipboard } from '../paste-timeline-clipboard';
import { useTimelineClipboard } from '../useTimelineClipboard';
import { captionLayerKey } from '@beam/engine/shared/composition-types';
import { TimelineLockedError } from '@beam/engine/composition/timeline-locks';

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

const caption = (
  id: string,
  layerId: string | undefined,
  timelineStartMs: number,
  text: string,
  order = 0,
): CaptionClip => ({
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

const findCaption = (source: ClipComposition, id: string): CaptionClip => {
  const found = source.clips.filter(isCaptionClip).find((clip) => clip.id === id);
  if (!found) throw new Error(`Missing caption ${id}`);
  return found;
};

const queuedIds = (ids: string[]) => () => {
  const id = ids.shift();
  if (!id) throw new Error('No more deterministic IDs are available.');
  return id;
};

afterEach(() => useTimelineClipboard().clearClipboard());

describe('pasteTimelineClipboard', () => {
  it.each([undefined, 'track'] as const)(
    'keeps a legacy text caption on its source track for context-menu paste (%s)',
    (placement) => {
      const original = caption('source', undefined, 0, 'Original');
      const item = useTimelineClipboard().copyClip('project-a', original);
      const result = pasteTimelineClipboard({
        composition: composition([original], []),
        zoomElements: [],
        item,
        timeMs: 500,
        timelineDurationMs: 3000,
        target: { category: 'caption', placement },
        idFactory: () => 'copy',
      });
      expect(result.composition.clips.map((clip) => [clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
        [0, 500],
        [500, 500],
      ]);
      expect(new Set(result.composition.clips.filter(isCaptionClip).map(captionLayerKey)).size).toBe(1);
      expect(findCaption(result.composition, 'copy').captionLayerId).toBe('source');
      expect(original.captionLayerId).toBeUndefined();
    },
  );

  it('keeps repeated overlapping legacy pastes on the same track after the original clip has been replaced', () => {
    const original = caption('source', undefined, 0, 'Original');
    const item = useTimelineClipboard().copyClip('project-a', original);
    let source = composition([original], []);
    for (const id of ['copy-a', 'copy-b', 'copy-c']) {
      source = pasteTimelineClipboard({
        composition: source,
        zoomElements: [],
        item,
        timeMs: 0,
        timelineDurationMs: 3000,
        target: { category: 'caption', placement: 'auto' },
        idFactory: queuedIds([id]),
      }).composition;
      expect(source.clips).toHaveLength(1);
      expect(findCaption(source, id).captionLayerId).toBe('source');
    }
  });
  it('reuses an assigned legacy track across repeated pastes of the same clipboard snapshot', () => {
    const copied = caption('source', undefined, 0, 'Original');
    const item = useTimelineClipboard().copyClip('project-a', copied);
    const paste = (source: ClipComposition, timeMs: number, ids: string[]) =>
      pasteTimelineClipboard({
        composition: source,
        zoomElements: [],
        item,
        timeMs,
        timelineDurationMs: 3_000,
        target: { category: 'caption', placement: 'auto' },
        idFactory: queuedIds(ids),
      });
    const first = paste(composition([copied], []), 500, ['copy-a']);
    const second = paste(first.composition, 1_000, ['copy-b']);
    const restored = JSON.parse(JSON.stringify(second.composition)) as ClipComposition;
    const third = paste(restored, 1_500, ['copy-c']);
    expect(new Set(third.composition.clips.filter((clip) => clip.kind === 'caption').map(captionLayerKey)).size).toBe(
      1,
    );
    const collision = paste(third.composition, 1_000, ['copy-d']);
    expect(findCaption(collision.composition, 'copy-d').captionLayerId).toBe('source');
    expect(collision.composition.clips.find((clip) => clip.id === 'copy-b')).toBeUndefined();
  });

  it('keeps cut legacy caption fragments together when the original track no longer exists', () => {
    const first = { ...caption('first', undefined, 0, 'First'), isAiGenerated: true };
    const second = { ...caption('second', undefined, 1_000, 'Second'), isAiGenerated: true };
    const result = pasteTimelineClipboard({
      composition: composition([], []),
      zoomElements: [],
      item: copySelection([first, second], [], [], first.id),
      timeMs: 500,
      timelineDurationMs: 3_000,
      target: { category: 'caption', placement: 'auto' },
      idFactory: queuedIds(['copy-a', 'copy-b']),
    });
    expect(result.composition.clips.filter(isCaptionClip).map((clip) => clip.captionLayerId)).toEqual([
      'first',
      'first',
    ]);
  });

  it.each([499.6, 999.4])('uses the same millisecond rounding as the paste transaction at %s ms', (timeMs) => {
    const copied = caption('source', 'captions', 0, 'Original');
    const neighbor = caption('neighbor', 'captions', 1_500, 'Next');
    const result = pasteTimelineClipboard({
      composition: composition([copied, neighbor], []),
      zoomElements: [],
      item: useTimelineClipboard().copyClip('project-a', copied),
      timeMs,
      timelineDurationMs: 3_000,
      target: { category: 'caption', placement: 'auto' },
      idFactory: () => 'copy',
    });
    expect(result.composition.clips.find((clip) => clip.id === 'copy')).toMatchObject({
      timelineStartMs: Math.round(timeMs),
      captionLayerId: 'captions',
    });
  });

  it.each([0, 500, 1_000, 2_000])('reuses a text caption track at %i ms when the copy fits', (timeMs) => {
    const copied = caption('source', 'captions', 500, 'Keep this text');
    const neighbor = caption('neighbor', 'captions', 1_500, 'Next caption');
    // 500 ms is occupied: this case also checks that cutting before pasting frees the track.
    const source = composition(timeMs === 500 ? [neighbor] : [copied, neighbor], []);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item: useTimelineClipboard().copyClip('project-a', copied),
      timeMs,
      timelineDurationMs: 3_000,
      target: { category: 'caption', placement: 'auto' },
      idFactory: () => 'copy',
    });
    expect(result.composition.clips.find((clip) => clip.id === 'copy')).toMatchObject({
      timelineStartMs: timeMs,
      captionLayerId: 'captions',
      caption: copied.caption,
    });
    expect(new Set(result.composition.clips.filter((clip) => clip.kind === 'caption').map(captionLayerKey)).size).toBe(
      1,
    );
    expect(source).toEqual(before);
  });

  it.each([
    {
      timeMs: 250,
      intervals: [
        [250, 500],
        [750, 250],
        [1500, 500],
      ],
    },
    {
      timeMs: 500,
      intervals: [
        [500, 500],
        [1500, 500],
      ],
    },
    {
      timeMs: 750,
      intervals: [
        [500, 250],
        [750, 500],
        [1500, 500],
      ],
    },
    {
      timeMs: 1250,
      intervals: [
        [500, 500],
        [1250, 500],
        [1750, 250],
      ],
    },
  ])('trims covered caption portions and pastes on the same track at $timeMs ms', ({ timeMs, intervals }) => {
    const copied = caption('source', 'captions', 500, 'Keep this text');
    const neighbor = { ...caption('neighbor', 'captions', 1500, 'Disabled but occupied'), enabled: false };
    const source = composition([copied, neighbor], []);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item: useTimelineClipboard().copyClip('project-a', copied),
      timeMs,
      timelineDurationMs: 3000,
      target: { category: 'caption', placement: 'auto' },
      idFactory: queuedIds(['copy']),
    });
    expect(findCaption(result.composition, 'copy')).toMatchObject({
      captionLayerId: 'captions',
      timelineStartMs: timeMs,
      caption: copied.caption,
    });
    expect(result.composition.clips.map((clip) => [clip.timelineStartMs, clip.timelineDurationMs])).toEqual(intervals);
    expect(new Set(result.composition.clips.filter(isCaptionClip).map(captionLayerKey)).size).toBe(1);
    expect(source).toEqual(before);
  });

  it.each([false, true])(
    'keeps legacy caption originals and copies on the same persisted track (AI: %s)',
    (isAiGenerated) => {
      const first = { ...caption('legacy-first', undefined, 0, 'First'), isAiGenerated };
      const second = { ...caption('legacy-second', undefined, 1_500, 'Second'), isAiGenerated };
      const source = composition([first, second], []);
      const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
      const result = pasteTimelineClipboard({
        composition: source,
        zoomElements: [],
        item: useTimelineClipboard().copyClip('project-a', first),
        timeMs: 500,
        timelineDurationMs: 3_000,
        target: { category: 'caption', placement: 'auto' },
        idFactory: queuedIds(['copy']),
      });
      const restored = JSON.parse(JSON.stringify(result.composition)) as ClipComposition;
      const original = restored.clips.find((clip) => clip.id === first.id) as CaptionClip;
      const pasted = restored.clips.find((clip) => clip.id === 'copy') as CaptionClip;
      expect(original.captionLayerId).toBe('legacy-first');
      expect(captionLayerKey(pasted)).toBe(captionLayerKey(original));
      expect(findCaption(restored, second.id).captionLayerId).toBe(isAiGenerated ? 'legacy-first' : undefined);
      expect(source).toEqual(before);
    },
  );

  it.each([false, true])(
    'keeps copied fragments on their original track, trimming a later collision (%s)',
    (reverse) => {
      const first = caption('first', 'captions', 0, 'First');
      const second = caption('second', 'captions', 2_000, 'Second');
      const collision = caption('collision', 'captions', 3_500, 'Existing');
      const source = composition([second, collision, first], []);
      const copied = reverse ? [second, first] : [first, second];
      const result = pasteTimelineClipboard({
        composition: source,
        zoomElements: [],
        item: copySelection(copied, [], [], second.id),
        timeMs: 1_500,
        timelineDurationMs: 5_000,
        target: { category: 'caption', placement: 'auto' },
        idFactory: queuedIds(['copy-a', 'copy-b']),
      });
      const pasted = result.composition.clips.filter(isCaptionClip).filter((clip) => result.clipIds.includes(clip.id));
      expect(pasted.map((clip) => clip.captionLayerId)).toEqual(['captions', 'captions']);
      expect(pasted.map((clip) => clip.timelineStartMs).sort((a, b) => a - b)).toEqual([1_500, 3_500]);
      expect(result.composition.clips.filter((clip) => !result.clipIds.includes(clip.id))).toEqual(
        expect.arrayContaining([first, second]),
      );
    },
  );

  it('checks each copied track independently and ignores overlapping captions on other tracks', () => {
    const first = caption('first', 'track-a', 0, 'First', 0);
    const second = caption('second', 'track-b', 0, 'Second', 1);
    const collision = caption('collision', 'track-b', 1_000, 'Existing', 1);
    const source = composition([first, second, collision], []);
    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item: copySelection([first, second], [], [], first.id),
      timeMs: 1_000,
      timelineDurationMs: 3_000,
      target: { category: 'caption', placement: 'auto' },
      idFactory: queuedIds(['copy-a', 'copy-b']),
    });
    expect(findCaption(result.composition, 'copy-a').captionLayerId).toBe('track-a');
    expect(findCaption(result.composition, 'copy-b').captionLayerId).toBe('track-b');
  });

  it.each(['captions', undefined])('rejects paste into a locked caption track (layer: %s)', (layerId) => {
    const copied = { ...caption('locked', layerId, 0, 'Locked'), locked: true };
    const source = composition([copied], []);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
    expect(() =>
      pasteTimelineClipboard({
        composition: source,
        zoomElements: [],
        item: useTimelineClipboard().copyClip('project-a', copied),
        timeMs: 500,
        timelineDurationMs: 3000,
        target: { category: 'caption', placement: 'auto' },
      }),
    ).toThrow(TimelineLockedError);
    expect(source).toEqual(before);
  });

  it.each([undefined, 'track'] as const)('preserves context-menu placement for keyboard captions (%s)', (placement) => {
    const keyboard: CaptionClip = {
      ...caption('keyboard', 'keyboard-track', 0, 'Keyboard'),
      caption: {
        type: 'keyboard',
        steps: [{ offsetMs: 0, modifiers: [], key: 'A' }],
        recordedPlatform: 'linux',
        sourceSessionId: 'session',
        followCursor: false,
        style: createDefaultCaptionStyle(),
      },
    };
    const result = pasteTimelineClipboard({
      composition: composition([keyboard], []),
      zoomElements: [],
      item: useTimelineClipboard().copyClip('project-a', keyboard),
      timeMs: 500,
      timelineDurationMs: 3000,
      target: { category: 'caption', placement },
      idFactory: () => 'copy',
    });
    expect(findCaption(result.composition, 'copy').captionLayerId).toBe('keyboard-track');
    expect(result.composition.clips).toHaveLength(2);
  });

  it('retains new-track keyboard pasting for visual clips and keyboard captions in a mixed selection', () => {
    const asset = mediaAsset('screen-asset');
    const screen = visual({ id: 'screen' });
    const keyboard: CaptionClip = {
      ...caption('keyboard', 'keyboard-track', 0, 'Keyboard', 1),
      caption: {
        type: 'keyboard',
        steps: [{ offsetMs: 0, modifiers: [], key: 'A' }],
        recordedPlatform: 'linux',
        sourceSessionId: 'session',
        followCursor: false,
        style: createDefaultCaptionStyle(),
      },
    };
    const source = composition([screen, keyboard], [asset]);
    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item: copySelection([screen, keyboard], [], [asset], screen.id),
      timeMs: 1_000,
      timelineDurationMs: 3_000,
      target: { category: 'visual', placement: 'auto' },
      idFactory: queuedIds(['new-keyboard-track', 'new-visual-track', 'screen-copy', 'keyboard-copy']),
    });
    expect(result.composition.clips.find((clip) => clip.id === 'screen-copy')?.trackId).toBe('new-visual-track');
    expect(findCaption(result.composition, 'keyboard-copy').captionLayerId).toBe('new-keyboard-track');
  });

  it('keeps all fragments of a legacy AI caption selection on one reused track when every destination fits', () => {
    const first = { ...caption('first', undefined, 0, 'First'), isAiGenerated: true };
    const second = { ...caption('second', undefined, 1_000, 'Second'), isAiGenerated: true };
    const source = composition([first, second], []);
    const result = pasteTimelineClipboard({
      composition: source,
      zoomElements: [],
      item: copySelection([first, second], [], [], second.id),
      timeMs: 2_000,
      timelineDurationMs: 4_000,
      target: { category: 'caption', placement: 'auto' },
      idFactory: queuedIds(['copy-a', 'copy-b']),
    });
    expect(new Set(result.composition.clips.filter((clip) => clip.kind === 'caption').map(captionLayerKey)).size).toBe(
      1,
    );
    expect(result.primary).toEqual({ type: 'clip', id: 'copy-b' });
    expect(
      result.composition.clips.filter((clip) => result.clipIds.includes(clip.id)).map((clip) => clip.timelineStartMs),
    ).toEqual([2_000, 3_000]);
  });

  it('leaves legacy source tracks unchanged if a later pasted item is out of bounds', () => {
    const first = caption('first', undefined, 0, 'First');
    const second = caption('second', undefined, 2_000, 'Second');
    const source = composition([first, second], []);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;
    expect(() =>
      pasteTimelineClipboard({
        composition: source,
        zoomElements: [],
        item: copySelection([first, second], [], [], first.id),
        timeMs: 3_000,
        timelineDurationMs: 4_000,
        target: { category: 'caption', placement: 'auto' },
      }),
    ).toThrow('does not fit');
    expect(source).toEqual(before);
  });

  it('pastes a single zoom without altering composition or requiring a clip transaction commit', () => {
    const original = composition([], []),
      copied = zoom('zoom', 1000, 2000);
    const item = useTimelineClipboard().copyZoom('project-a', copied, [copied]);
    const result = pasteTimelineClipboard({
      composition: original,
      zoomElements: [],
      item,
      timeMs: 2000,
      timelineDurationMs: 5000,
    });
    expect(result.composition).toBe(original);
    expect(result.zoomElements[0]).toMatchObject({
      startMs: 2000,
      endMs: 3000,
    });
    expect(result.primary.type).toBe('zoom');
  });
  it('uses the original lane for a single clip and maps later selection lanes to independent destinations', () => {
    const asset = mediaAsset('screen-asset'),
      first = visual({ id: 'first', trackId: 'first-lane' }),
      second = visual({ id: 'second', trackId: 'second-lane' });
    const original = composition([], [asset]);
    const single = useTimelineClipboard().copyClip('project-a', first, asset);
    const one = pasteTimelineClipboard({
      composition: original,
      zoomElements: [],
      item: single,
      timeMs: 0,
      timelineDurationMs: 2000,
      idFactory: () => 'one',
    });
    expect(one.composition.clips[0]).toMatchObject({ trackId: 'first-lane' });
    const selection = copySelection([first, second], [], [asset], first.id);
    const multi = pasteTimelineClipboard({
      composition: original,
      zoomElements: [],
      item: selection,
      timeMs: 0,
      timelineDurationMs: 2000,
      target: { category: 'visual', trackId: 'target-lane' },
      idFactory: queuedIds(['first-copy', 'new-layer', 'second-copy']),
    });
    expect(multi.composition.clips.map((c) => ('trackId' in c ? c.trackId : null))).toEqual([
      'target-lane',
      'new-layer',
    ]);
  });
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
