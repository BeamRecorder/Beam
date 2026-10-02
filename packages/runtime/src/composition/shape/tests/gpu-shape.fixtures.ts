import { vi } from 'vitest';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';

export const shape = (patch: Partial<ShapeClip> = {}): ShapeClip => ({
  id: 'shape',
  kind: 'shape',
  assetId: '',
  name: 'Shape',
  timelineStartMs: 0,
  timelineDurationMs: 60000,
  sourceInMs: 0,
  sourceDurationMs: 60000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'shape',
  ...DEFAULT_ANNOTATION_SHAPE_STYLE,
  transform: {
    x: 576 / 1920,
    y: 324 / 1080,
    width: 768 / 1920,
    height: 324 / 1080,
  },
  ...patch,
});
export const context = () =>
  ({
    canvas: { width: 1920, height: 1080 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  }) as unknown as Canvas2DContext;
