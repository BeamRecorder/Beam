import { afterEach, describe, expect, it } from 'vitest';
import type { MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
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
    expect(copied?.category).toBe('visual');
    if (!copied || copied.type !== 'clip') throw new Error('Expected a copied visual clip');
    expect(copied.scopeId).toBe('project-a');
    expect(copied.clip.id).toBe(sourceClip.id);
    expect(copied.clip.timelineStartMs).toBe(1_000);
    expect((copied.clip as VisualClip).transform.x).toBe(0.1);
    expect(copied.asset?.name).toBe('Original video');
    expect(copied.clip).not.toBe(sourceClip);
    expect(copied.asset).not.toBe(sourceAsset);
  });

  it('copies zooms as isolated snapshots and replaces the previous clipboard item', () => {
    const sourceZoom = zoom();
    const clipboard = useTimelineClipboard();

    clipboard.copyZoom('project-a', sourceZoom);
    sourceZoom.startMs = 8_000;

    const copied = clipboard.getClipboardItem();
    expect(copied).toEqual({
      type: 'zoom',
      scopeId: 'project-a',
      category: 'zoom',
      zoom: expect.objectContaining({ id: 'zoom-1', startMs: 2_000, endMs: 4_000 }),
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

    clipboard.copyZoom('project-a', zoom());
    expect(clipboard.hasClipboardItem.value).toBe(true);
    expect(clipboard.canPaste('project-a')).toBe(true);
    expect(clipboard.canPaste('project-b')).toBe(false);

    clipboard.clearClipboard();
    expect(clipboard.hasClipboardItem.value).toBe(false);
    expect(clipboard.getClipboardItem()).toBe(null);
  });
});
