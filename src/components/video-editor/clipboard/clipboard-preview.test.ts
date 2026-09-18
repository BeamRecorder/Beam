import { describe, expect, it } from 'vitest';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '~/media/shared/shape-layer-style';
import type { MediaAsset, ShapeClip, VisualClip } from '~/media/shared/composition-types';
import type { ScreenshotLayerClipboard } from '../screenshot/screenshot-layer-clipboard-types';
import type { TimelineClipboardItem } from '../timeline/composables/timeline-clipboard-types';
import { screenshotClipboardPreview, timelineClipboardPreview } from './clipboard-preview';

const shape = (id = 'shape-1'): ShapeClip => ({
  id,
  kind: 'shape',
  name: 'Rectangle',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: id,
  transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.3 },
  ...DEFAULT_ANNOTATION_SHAPE_STYLE,
});

describe('clipboard preview descriptors', () => {
  it('uses the copied media itself for Studio images and videos', () => {
    const clip = {
      ...shape('video-1'),
      kind: 'video',
      name: 'Recording',
      assetId: 'asset-1',
      appearance: {} as VisualClip['appearance'],
      isMirrored: false,
      isMirroredY: false,
    } as VisualClip;
    const asset: MediaAsset = {
      id: 'asset-1',
      kind: 'video',
      name: 'Recording',
      fileName: 'recording.mp4',
      durationMs: 2_000,
      width: 1920,
      height: 1080,
      src: 'project-media://recording.mp4',
      origin: 'project',
    };
    const item: TimelineClipboardItem = {
      type: 'clip',
      scopeId: 'project-1',
      category: 'visual',
      clip,
      asset,
      descriptor: { kind: 'item', name: 'Recording' },
    };

    expect(timelineClipboardPreview(item)).toEqual({
      kind: 'video',
      src: 'project-media://recording.mp4',
      alt: 'Recording',
    });
  });

  it('creates the same portable image preview shape for Screenshot selections', () => {
    const clipboard: ScreenshotLayerClipboard = {
      entries: [
        {
          layer: { type: 'shape', value: shape('shape-1') },
          name: 'Rectangle',
          opacity: 100,
          blendMode: 'source-over',
        },
        {
          layer: { type: 'shape', value: shape('shape-2') },
          name: 'Rectangle 2',
          opacity: 100,
          blendMode: 'source-over',
        },
      ],
      primaryIndex: 0,
    };

    expect(screenshotClipboardPreview(clipboard)).toEqual(
      expect.objectContaining({
        kind: 'image',
        src: expect.stringMatching(/^data:image\/svg\+xml/),
        alt: 'Rectangle',
        count: 2,
      }),
    );
  });
});
