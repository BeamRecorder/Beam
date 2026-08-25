import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorClip, ShapeClip } from '~/media/shared/composition-types';
import { drawColorClip } from '../../../video-editor/composition/color/render-color-clip';
import { drawShapeClip } from '../../../video-editor/composition/shape/render-shape-clip';
import { drawWithClipTransition } from '../../../video-editor/composition/transitions/render-transition';
import { drawExportGeneratedLayer } from '../render-generated-layer';

vi.mock('../../../video-editor/composition/color/render-color-clip', () => ({ drawColorClip: vi.fn() }));
vi.mock('../../../video-editor/composition/shape/render-shape-clip', () => ({ drawShapeClip: vi.fn() }));
vi.mock('../../../video-editor/composition/transitions/render-transition', () => ({
  drawWithClipTransition: vi.fn((_ctx, _clip, _time, _frame, draw: () => void) => draw()),
}));

const common = {
  id: 'generated',
  trackId: 'generated-track',
  name: 'Generated',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
} as const;

beforeEach(() => vi.clearAllMocks());

describe('drawExportGeneratedLayer', () => {
  it('routes color and shape clips through the same transitioned export viewport', () => {
    const ctx = {} as CanvasRenderingContext2D;
    const frame = { x: 10, y: 20, width: 1_920, height: 1_080 };
    const color = { ...common, kind: 'color', fill: { kind: 'color', color: '#123456' } } as ColorClip;
    const shape = {
      ...common,
      kind: 'shape',
      family: 'shape',
      preset: 'star',
      fillColor: '#ff5a1f',
      borderColor: '#ffffff',
      borderWidth: 0,
      cornerRadius: 16,
      arrowThickness: 36,
      arrowHeadSize: 38,
      rotation: 0,
      opacityEnabled: false,
      opacity: 70,
      backdropBlur: 35,
      shadowEnabled: false,
      shadowColor: '#000000',
      shadowBlur: 32,
      shadowDirection: 'bottom-right',
    } as ShapeClip;

    drawExportGeneratedLayer(ctx, color, 250, frame);
    drawExportGeneratedLayer(ctx, shape, 250, frame);

    expect(drawWithClipTransition).toHaveBeenCalledTimes(2);
    expect(drawColorClip).toHaveBeenCalledWith(ctx, color, frame);
    expect(drawShapeClip).toHaveBeenCalledWith(ctx, shape, frame);
  });
});
