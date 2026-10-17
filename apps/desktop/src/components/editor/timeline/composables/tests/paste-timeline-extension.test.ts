import { afterEach, describe, expect, it } from 'vitest';
import { emptyComposition, type Clip, type MediaAsset, type ShapeClip } from '@beam/engine/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';
import { compositionDurationMs } from '@beam/engine/shared/timeline-mapping';
import { compositionWithZoomDuration } from '@beam/engine/composition/composition-duration';
import { colorClip } from '@beam/engine/scene/tests/scene-fixtures';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import { pasteTimelineClipboard } from '../paste-timeline-clipboard';
import { useTimelineClipboard } from '../useTimelineClipboard';

const base = {
  id: 'source',
  name: 'Copied item',
  timelineStartMs: 0,
  timelineDurationMs: 500,
  sourceInMs: 0,
  sourceDurationMs: 500,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'source',
  transitions: { entry: null, exit: null },
};
const transform = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
const shape = (family: ShapeClip['family']): ShapeClip => ({
  ...base,
  ...DEFAULT_SHAPE_LAYER_STYLE,
  kind: 'shape',
  assetId: '',
  transform,
  family,
  preset: family === 'arrow' ? 'arrow' : family === 'text' ? 'text' : family === 'drawing' ? 'freehand' : 'rectangle',
  ...(family === 'text' ? { text: createElementText('Copied text') } : {}),
  ...(family === 'drawing'
    ? {
        drawing: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          smoothing: 65,
          strokeWidth: 8,
        },
      }
    : {}),
});
const asset = (kind: MediaAsset['kind']): MediaAsset => ({
  id: 'media',
  kind,
  name: 'Copied media',
  fileName: kind === 'image' ? 'image.png' : kind === 'audio' ? 'audio.wav' : 'video.mp4',
  durationMs: kind === 'image' ? 0 : 10000,
  src: 'project-media://media',
  origin: 'project',
  width: kind === 'audio' ? null : 1280,
  height: kind === 'audio' ? null : 720,
});
const cases: Array<{ label: string; clip: Clip; media: MediaAsset | null }> = [
  ...(['screen', 'video', 'image', 'webcam'] as const).map((kind) => ({
    label: kind,
    media: asset(kind === 'image' ? 'image' : 'video'),
    clip: {
      ...base,
      kind,
      assetId: 'media',
      transform,
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
    },
  })),
  {
    label: 'audio',
    media: asset('audio'),
    clip: { ...base, kind: 'audio', assetId: 'media', role: 'imported', volume: 100 },
  },
  {
    label: 'caption',
    media: null,
    clip: {
      ...base,
      kind: 'caption',
      caption: {
        type: 'text',
        sentences: [{ id: 'sentence', text: 'Caption', startMs: 0, endMs: 500, words: [] }],
        style: createDefaultCaptionStyle(),
      },
    },
  },
  { label: 'color', media: null, clip: { ...colorClip(), ...base } },
  ...(['shape', 'arrow', 'text', 'drawing'] as const).map((family) => ({
    label: family,
    media: null,
    clip: shape(family),
  })),
  ...(['blur', 'highlight'] as const).map((mode) => ({
    label: mode,
    media: null,
    clip: {
      ...base,
      kind: 'blur' as const,
      assetId: '',
      transform,
      shape: 'rectangle' as const,
      mode,
      strength: 60,
      feather: 0,
      tintOpacity: 0,
      color: '#000000',
    },
  })),
];
const project = () => ({
  ...emptyComposition(),
  clips: [{ ...colorClip('background'), timelineDurationMs: 2000, sourceDurationMs: 2000 }],
});
afterEach(() => useTimelineClipboard().clearClipboard());

describe('timeline paste grows the project', () => {
  it.each(cases)('pastes $label at and beyond the old end without trimming or stretching it', ({ clip, media }) => {
    for (const timeMs of [1900, 2000, 5000]) {
      const original = project();
      const item = useTimelineClipboard().copyClip('project', clip, media);
      const before = JSON.stringify({ original, item });
      const result = pasteTimelineClipboard({
        composition: original,
        zoomElements: [],
        item,
        timeMs,
        timelineDurationMs: 2000,
        target: { category: item.category, placement: 'auto' },
      });
      const pasted = result.composition.clips.find((entry) => result.clipIds.includes(entry.id))!;
      expect(pasted).toMatchObject({
        kind: clip.kind,
        timelineStartMs: timeMs,
        timelineDurationMs: 500,
        sourceInMs: clip.sourceInMs,
        sourceDurationMs: 500,
        playbackRate: 1,
      });
      expect(compositionDurationMs(result.composition)).toBe(timeMs + 500);
      expect(result.composition.clips.find((entry) => entry.id === 'background')).toEqual(original.clips[0]);
      expect(JSON.stringify({ original, item })).toBe(before);
    }
  });

  it('allows the first paste into an empty project', () => {
    const result = pasteTimelineClipboard({
      composition: emptyComposition(),
      zoomElements: [],
      item: useTimelineClipboard().copyClip('project', shape('text')),
      timeMs: 0,
      timelineDurationMs: 0,
    });
    expect(compositionDurationMs(result.composition)).toBe(500);
  });

  it.each([0, 1900, 2000, 5000])(
    'pastes a zoom at %s ms and derives a playable extent without touching source clips',
    (timeMs) => {
      const original = project();
      const copied = createManualZoom('copy', 200, 700);
      const result = pasteTimelineClipboard({
        composition: original,
        zoomElements: [],
        item: useTimelineClipboard().copyZoom('project', copied, [copied]),
        timeMs,
        timelineDurationMs: 2000,
      });
      const view = compositionWithZoomDuration(result.composition, result.zoomElements);
      expect(compositionDurationMs(view)).toBe(Math.max(2000, timeMs + 500));
      expect(result.composition).toBe(original);
      expect(result.zoomElements[0]).toMatchObject({ startMs: timeMs, endMs: timeMs + 500 });
    },
  );

  it('plans the whole mixed bundle before applying a zoom-first selection and preserves gaps', () => {
    const copiedClip = { ...shape('text'), timelineStartMs: 2500 };
    const copiedZoom = createManualZoom('zoom', 0, 1000);
    const item = useTimelineClipboard().copySelection({
      scopeId: 'project',
      clips: [copiedClip],
      zooms: [copiedZoom],
      allZooms: [copiedZoom],
      primaryId: copiedClip.id,
      assetFor: () => null,
    });
    if (item?.type !== 'selection') throw new Error('Expected a mixed selection');
    item.entries.reverse();
    item.primaryIndex = 1;
    const result = pasteTimelineClipboard({
      composition: project(),
      zoomElements: [],
      item,
      timeMs: 2000,
      timelineDurationMs: 2000,
      target: { category: 'visual', placement: 'auto' },
    });
    expect(result.zoomElements[0]).toMatchObject({ startMs: 2000, endMs: 3000 });
    expect(result.composition.clips.find((entry) => result.clipIds.includes(entry.id))).toMatchObject({
      timelineStartMs: 4500,
      timelineDurationMs: 500,
    });
    expect(compositionDurationMs(compositionWithZoomDuration(result.composition, result.zoomElements))).toBe(5000);
    expect(result.primary.type).toBe('clip');
  });

  it('lets a trailing zoom extend beyond the last pasted clip without adding artificial media', () => {
    const copiedClip = shape('text');
    const copiedZoom = createManualZoom('zoom', 1000, 1500);
    const item = useTimelineClipboard().copySelection({
      scopeId: 'project',
      clips: [copiedClip],
      zooms: [copiedZoom],
      allZooms: [copiedZoom],
      primaryId: copiedZoom.id,
      assetFor: () => null,
    });
    if (!item) throw new Error('Expected selection');
    const result = pasteTimelineClipboard({
      composition: project(),
      zoomElements: [],
      item,
      timeMs: 2000,
      timelineDurationMs: 2000,
    });
    expect(result.composition.clips).toHaveLength(2);
    expect(compositionDurationMs(result.composition)).toBe(2500);
    expect(compositionDurationMs(compositionWithZoomDuration(result.composition, result.zoomElements))).toBe(3500);
  });

  it.each([-1, NaN, Infinity])('still rejects invalid destination time %s atomically', (timeMs) => {
    const composition = project();
    const before = JSON.stringify(composition);
    expect(() =>
      pasteTimelineClipboard({
        composition,
        zoomElements: [],
        item: useTimelineClipboard().copyClip('project', shape('text')),
        timeMs,
        timelineDurationMs: 2000,
      }),
    ).toThrow();
    expect(JSON.stringify(composition)).toBe(before);
  });

  it.each([-1, NaN, Infinity])('still rejects invalid timeline duration %s', (timelineDurationMs) => {
    expect(() =>
      pasteTimelineClipboard({
        composition: project(),
        zoomElements: [],
        item: useTimelineClipboard().copyClip('project', shape('text')),
        timeMs: 2000,
        timelineDurationMs,
      }),
    ).toThrow('Invalid paste position');
  });
});
