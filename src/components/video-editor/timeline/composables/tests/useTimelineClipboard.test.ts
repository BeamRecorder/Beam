import { afterEach, describe, expect, it } from 'vitest';
import type { CaptionClip, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ZoomElement } from '../../../zoom/zoom-types';
import { getClipCategory, useTimelineClipboard } from '../useTimelineClipboard';

const asset: MediaAsset = {
  id: 'video-asset',
  kind: 'video',
  name: 'Original video',
  fileName: 'original.mp4',
  durationMs: 10_000,
  width: 1_920,
  height: 1_080,
  src: '/media/original.mp4',
  origin: 'project',
};

const clip = (): VisualClip => ({
  id: 'camera-clip',
  kind: 'webcam',
  name: 'Camera',
  assetId: asset.id,
  timelineStartMs: 1_000,
  timelineDurationMs: 3_000,
  sourceInMs: 250,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'camera-track',
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
  appearance: createDefaultClipAppearance('webcam'),
  isMirrored: false,
  isMirroredY: false,
});

const zoom = (): ZoomElement => ({
  id: 'zoom-1',
  sessionId: 'session-1',
  startMs: 2_000,
  endMs: 4_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 5,
  mode: 'manual',
});

const secondAsset: MediaAsset = {
  ...asset,
  id: 'second-video-asset',
  name: 'Second video',
  fileName: 'second.mp4',
};

const textCaption = (overrides: Partial<Extract<CaptionClip['caption'], { type: 'text' }>> = {}): CaptionClip => ({
  id: 'caption-clip',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  caption: {
    type: 'text',
    sentences: [],
    style: createDefaultCaptionStyle(),
    ...overrides,
  },
});

const keyboardCaption = (): CaptionClip => ({
  ...textCaption(),
  id: 'keyboard-caption',
  name: 'Keyboard Captions',
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: ['control', 'shift'], key: 'k' }],
    followCursor: true,
    recordedPlatform: 'linux',
    sourceSessionId: 'session-1',
    style: createDefaultCaptionStyle(),
  },
});

afterEach(() => {
  useTimelineClipboard().clearClipboard();
});

describe('useTimelineClipboard', () => {
  it('classifies every timeline item category, including webcam as visual', () => {
    expect(getClipCategory(clip())).toBe('visual');
    expect(getClipCategory({ ...clip(), kind: 'screen' })).toBe('visual');
    expect(getClipCategory({ ...clip(), kind: 'image' })).toBe('visual');
    expect(
      getClipCategory({
        ...clip(),
        kind: 'audio',
        role: 'imported',
        volume: 100,
      } as never),
    ).toBe('audio');
    expect(
      getClipCategory({
        ...clip(),
        kind: 'caption',
        caption: { type: 'text', sentences: [], style: {} },
      } as never),
    ).toBe('caption');
  });

  it('copies a clip and its asset as an isolated snapshot', () => {
    const sourceClip = clip();
    const sourceAsset = { ...asset };
    const clipboard = useTimelineClipboard();

    clipboard.copyClip('project-a', sourceClip, sourceAsset);
    sourceClip.timelineStartMs = 9_000;
    sourceClip.transform.x = 0.8;
    sourceAsset.name = 'Mutated asset';

    const copied = clipboard.getClipboardItem();
    if (!copied || copied.type !== 'clip') throw new Error('Expected a copied visual clip');
    expect(copied.category).toBe('visual');
    expect(copied.scopeId).toBe('project-a');
    expect(copied.clip.id).toBe(sourceClip.id);
    expect(copied.clip.timelineStartMs).toBe(1_000);
    expect((copied.clip as VisualClip).transform.x).toBe(0.1);
    expect(copied.asset?.name).toBe('Original video');
    expect(copied.clip).not.toBe(sourceClip);
    expect(copied.asset).not.toBe(sourceAsset);
    expect(copied.descriptor).toEqual({ kind: 'item', name: 'original.mp4' });
  });

  it('copies a mixed selection as an isolated bundle with its anchor and primary item', () => {
    const first = clip();
    const second = { ...clip(), id: 'camera-later', assetId: secondAsset.id, timelineStartMs: 5_000 };
    const earlyZoom = { ...zoom(), id: 'zoom-early', startMs: 500, endMs: 1_500 };
    const lateZoom = { ...zoom(), id: 'zoom-late', startMs: 6_000, endMs: 6_500 };
    const clipboard = useTimelineClipboard();

    const copiedItem = clipboard.copySelection({
      scopeId: 'project-a',
      clips: [first, second],
      zooms: [earlyZoom, lateZoom],
      allZooms: [earlyZoom, lateZoom],
      primaryId: second.id,
      assetFor: (candidate) => ('assetId' in candidate && candidate.assetId === secondAsset.id ? secondAsset : asset),
    });
    if (!copiedItem || copiedItem.type !== 'selection') throw new Error('Expected a copied timeline selection');

    first.timelineStartMs = 9_000;
    first.transform.x = 0.8;
    secondAsset.name = 'Changed after copy';
    earlyZoom.startMs = 7_000;
    earlyZoom.focus.cx = 0.9;

    const copied = clipboard.getClipboardItem();
    if (!copied || copied.type !== 'selection') throw new Error('Expected a copied timeline selection');

    expect(copied.scopeId).toBe('project-a');
    expect(copied.anchorTimeMs).toBe(500);
    expect(copied.primaryIndex).toBe(1);
    expect(copied.entries.map((entry) => (entry.type === 'clip' ? entry.clip.id : entry.zoom.id))).toEqual([
      'camera-clip',
      'camera-later',
      'zoom-early',
      'zoom-late',
    ]);
    expect(copied.entries[0]).toMatchObject({
      type: 'clip',
      clip: { timelineStartMs: 1_000, transform: { x: 0.1 } },
      asset: { id: 'video-asset', name: 'Original video' },
    });
    expect(copied.entries[1]).toMatchObject({
      type: 'clip',
      clip: { timelineStartMs: 5_000 },
      asset: { id: 'second-video-asset', name: 'Second video' },
    });
    expect(copied.entries[2]).toMatchObject({
      type: 'zoom',
      zoom: { startMs: 500, focus: { cx: 0.5 } },
    });
    expect(copied.descriptor).toMatchObject({ kind: 'selection', items: expect.any(Array) });
    const copiedFirst = copied.entries[0];
    if (copiedFirst.type !== 'clip') throw new Error('Expected a copied clip entry');
    expect(copiedFirst.clip).not.toBe(first);
    expect(copiedFirst.asset).not.toBe(asset);
  });

  it('falls back from an empty asset filename to the track name and then the asset name', () => {
    const clipboard = useTimelineClipboard();

    clipboard.copyClip('project-a', clip(), { ...asset, fileName: '' });
    expect(clipboard.getClipboardItem()).toEqual(
      expect.objectContaining({ descriptor: { kind: 'item', name: 'Camera' } }),
    );

    clipboard.copyClip('project-a', clip(), null);
    expect(clipboard.getClipboardItem()).toEqual(
      expect.objectContaining({ descriptor: { kind: 'item', name: 'Camera' } }),
    );

    clipboard.copyClip('project-a', { ...clip(), name: '' }, { ...asset, fileName: '' });
    expect(clipboard.getClipboardItem()).toEqual(
      expect.objectContaining({ descriptor: { kind: 'item', name: 'Original video' } }),
    );
  });

  it('describes custom, sentence, keyboard, and truncated caption text', () => {
    const clipboard = useTimelineClipboard();
    const longText = 'A'.repeat(80);

    clipboard.copyClip('project-a', textCaption({ style: { ...createDefaultCaptionStyle(), customText: longText } }));
    let copied = clipboard.getClipboardItem();
    expect(copied?.descriptor).toEqual({ kind: 'caption', text: `${'A'.repeat(71)}…` });

    clipboard.copyClip(
      'project-a',
      textCaption({
        sentences: [{ id: 'sentence', text: '  First line  ', startMs: 0, endMs: 500, words: [] }],
        style: createDefaultCaptionStyle(),
      }),
    );
    copied = clipboard.getClipboardItem();
    expect(copied?.descriptor).toEqual({ kind: 'caption', text: 'First line' });

    clipboard.copyClip('project-a', keyboardCaption());
    copied = clipboard.getClipboardItem();
    expect(copied?.descriptor).toEqual({ kind: 'caption', text: 'control+shift+k' });
  });

  it('copies zooms as isolated snapshots and replaces the previous clipboard item', () => {
    const sourceZoom = zoom();
    const clipboard = useTimelineClipboard();

    clipboard.copyZoom('project-a', sourceZoom, [
      { ...sourceZoom, id: 'zoom-before', startMs: 0, endMs: 1_000 },
      sourceZoom,
      { ...sourceZoom, id: 'zoom-after', startMs: 5_000, endMs: 6_000 },
    ]);
    sourceZoom.startMs = 8_000;

    const copied = clipboard.getClipboardItem();
    expect(copied).toEqual({
      type: 'zoom',
      scopeId: 'project-a',
      category: 'zoom',
      zoom: expect.objectContaining({ id: 'zoom-1', startMs: 2_000, endMs: 4_000 }),
      descriptor: { kind: 'zoom', number: 2 },
    });
    expect(copied).not.toBe(null);
    if (copied?.type === 'zoom') expect(copied.zoom).not.toBe(sourceZoom);

    clipboard.copyClip('project-a', clip());
    expect(clipboard.clipboardCategory.value).toBe('visual');
    expect(clipboard.canPaste('project-a')).toBe(true);
    expect(clipboard.canPaste('project-b')).toBe(false);
  });

  it('allows any copied category within the same project scope and can be cleared', () => {
    const clipboard = useTimelineClipboard();
    expect(clipboard.hasClipboardItem.value).toBe(false);
    expect(clipboard.canPaste('project-a')).toBe(false);

    clipboard.copyZoom('project-a', zoom(), [zoom()]);
    expect(clipboard.hasClipboardItem.value).toBe(true);
    expect(clipboard.canPaste('project-a')).toBe(true);
    expect(clipboard.canPaste('project-b')).toBe(false);

    clipboard.clearClipboard();
    expect(clipboard.hasClipboardItem.value).toBe(false);
    expect(clipboard.getClipboardItem()).toBe(null);
  });
});
