import { describe, expect, it } from 'vitest';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { AudioClip, CaptionClip, Clip, VisualClip } from '~/media/shared/composition-types';
import { groupTextCaptionLayers, reorderTextCaptionOrders } from './caption-layer-layout';

const textCaption = (
  id: string,
  order: number,
  options: Pick<CaptionClip, 'captionLayerId' | 'isAiGenerated'> = {},
): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order,
  ...options,
  caption: {
    type: 'text',
    sentences: [],
    style: createDefaultCaptionStyle(),
  },
});

const keyboardCaption = (id: string, order: number): CaptionClip => ({
  ...textCaption(id, order),
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: [], key: 'A' }],
    followCursor: false,
    recordedPlatform: 'linux',
    sourceSessionId: 'session-1',
    style: createDefaultCaptionStyle(),
  },
});

const visual = (id: string, order: number): VisualClip => ({
  id,
  trackId: id,
  kind: 'image',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
});

const audio = (id: string, order: number): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: `${id}-asset`,
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order,
  volume: 100,
});

const orderedIds = (clips: Clip[]) => [...clips].sort((left, right) => left.order - right.order).map((clip) => clip.id);

const textIds = (clips: Clip[]) =>
  [...clips]
    .filter((clip) => clip.kind === 'caption' && clip.caption.type === 'text')
    .sort((left, right) => left.order - right.order)
    .map((clip) => clip.id);

describe('reorderTextCaptionOrders', () => {
  it.each([
    [
      'shared explicit identity',
      [textCaption('first', 0, { captionLayerId: 'shared' }), textCaption('second', 1, { captionLayerId: 'shared' })],
      ['caption-layer:shared'],
    ],
    [
      'manual captions without identity',
      [textCaption('first', 0), textCaption('second', 1)],
      ['caption-clip:first', 'caption-clip:second'],
    ],
    [
      'legacy AI captions without identity',
      [textCaption('first', 0, { isAiGenerated: true }), textCaption('second', 1, { isAiGenerated: true })],
      ['caption-layer:legacy-ai'],
    ],
    [
      'explicit and legacy AI captions',
      [
        textCaption('first', 0, { captionLayerId: 'explicit', isAiGenerated: true }),
        textCaption('second', 1, { isAiGenerated: true }),
      ],
      ['caption-layer:explicit', 'caption-layer:legacy-ai'],
    ],
  ] as const)('groups %s into the expected logical layers', (_case, clips, expectedIds) => {
    expect(groupTextCaptionLayers([...clips]).map((layer) => layer.id)).toEqual(expectedIds);
  });

  it('groups phrase clips by captionLayerId and moves the whole layer together', () => {
    const clips = [
      textCaption('ai-phrase-1', 0, { captionLayerId: 'ai-layer', isAiGenerated: true }),
      textCaption('ai-phrase-2', 1, { captionLayerId: 'ai-layer', isAiGenerated: true }),
      textCaption('manual-caption', 2, { isAiGenerated: false }),
      visual('video', 3),
      audio('audio', 4),
    ];

    const layers = groupTextCaptionLayers(clips.filter((clip): clip is CaptionClip => clip.kind === 'caption'));
    expect(layers.map((layer) => layer.id)).toEqual(['caption-layer:ai-layer', 'caption-clip:manual-caption']);
    expect(layers[0]?.clips.map((clip) => clip.id)).toEqual(['ai-phrase-1', 'ai-phrase-2']);

    const result = reorderTextCaptionOrders(clips, 'ai-phrase-1', 1);

    expect(result).not.toBeNull();
    expect(textIds(result!)).toEqual(['manual-caption', 'ai-phrase-1', 'ai-phrase-2']);
    expect(result!.find((clip) => clip.id === 'ai-phrase-1')?.order).toBe(1);
    expect(result!.find((clip) => clip.id === 'ai-phrase-2')?.order).toBe(1);
    expect(result!.find((clip) => clip.id === 'manual-caption')?.order).toBe(0);
    expect(orderedIds(result!).slice(-2)).toEqual(['video', 'audio']);
  });

  it.each([
    ['first', 'caption-last', 0, ['caption-last', 'caption-first', 'caption-middle']],
    ['last', 'caption-first', 2, ['caption-middle', 'caption-last', 'caption-first']],
  ] as const)('moves a text caption to the %s caption slot', (_position, clipId, targetIndex, expectedTextIds) => {
    const clips = [
      textCaption('caption-first', 0),
      textCaption('caption-middle', 1),
      textCaption('caption-last', 2),
      visual('video', 3),
      audio('audio', 4),
    ];

    const result = reorderTextCaptionOrders(clips, clipId, targetIndex);

    expect(result).not.toBeNull();
    expect(textIds(result!)).toEqual(expectedTextIds);
    expect(orderedIds(result!)).toEqual([...expectedTextIds, 'video', 'audio']);
  });

  it.each([
    [-100, ['caption-middle', 'caption-first', 'caption-last']],
    [100, ['caption-first', 'caption-last', 'caption-middle']],
  ] as const)('clamps a target index of %s to the text caption range', (targetIndex, expectedTextIds) => {
    const clips = [
      textCaption('caption-first', 0),
      textCaption('caption-middle', 1),
      textCaption('caption-last', 2),
      visual('video', 3),
    ];

    const result = reorderTextCaptionOrders(clips, 'caption-middle', targetIndex);

    expect(result).not.toBeNull();
    expect(textIds(result!)).toEqual(expectedTextIds);
  });

  it('returns null for invalid and non-text reorder requests', () => {
    const clips = [textCaption('caption', 0), visual('video', 1), keyboardCaption('keyboard', 2)];

    expect(reorderTextCaptionOrders(clips, 'missing', 0)).toBeNull();
    expect(reorderTextCaptionOrders(clips, 'caption', Number.NaN)).toBeNull();
    expect(reorderTextCaptionOrders(clips, 'video', 0)).toBeNull();
    expect(reorderTextCaptionOrders(clips, 'keyboard', 0)).toBeNull();
  });

  it('keeps non-caption layers in their original relative order', () => {
    const clips = [
      textCaption('caption-first', 0),
      keyboardCaption('keyboard', 1),
      textCaption('caption-last', 2),
      visual('video', 3),
      audio('audio', 4),
    ];

    const result = reorderTextCaptionOrders(clips, 'caption-first', 1);

    expect(result).not.toBeNull();
    expect(orderedIds(result!).filter((id) => !id.startsWith('caption-'))).toEqual(['keyboard', 'video', 'audio']);
  });
});
