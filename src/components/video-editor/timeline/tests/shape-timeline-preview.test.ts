import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import type { Canvas2DContext } from '~/types/canvas';

const renderers = vi.hoisted(() => ({ drawShapeClip: vi.fn() }));
vi.mock('../../composition/shape/render-shape-clip', () => ({ drawShapeClip: renderers.drawShapeClip }));

import { renderShapeTimelinePreview } from '../shape-timeline-preview';

const shapeClip = (overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  id: 'shape-1',
  kind: 'shape',
  name: 'Callout',
  assetId: '',
  trackId: 'shape-track',
  timelineStartMs: 250,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.72, y: 0.16, width: 0.78, height: 0.62 },
  family: 'drawing',
  preset: 'freehand',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 18,
  cornerRadius: 12,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 37,
  opacityEnabled: true,
  opacity: 82,
  backdropBlur: 0,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowBlur: 30,
  shadowDirection: 'bottom-right',
  text: createElementText('Keep this text'),
  drawing: {
    points: [
      { x: 0.12, y: 0.18 },
      { x: 0.68, y: 0.82 },
    ],
    smoothing: 0.4,
    strokeWidth: 24,
  },
  ...overrides,
});

const translate = vi.fn();
const context = { translate } as unknown as Canvas2DContext;
let renderedCanvas: HTMLCanvasElement | null = null;
let encodedSize: { width: number; height: number; type: string } | null = null;
let contextAvailable = true;

beforeEach(() => {
  renderers.drawShapeClip.mockReset();
  translate.mockReset();
  renderedCanvas = null;
  encodedSize = null;
  contextAvailable = true;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    renderedCanvas = this;
    return contextAvailable ? (context as CanvasRenderingContext2D) : null;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
    type = 'image/png',
  ) {
    encodedSize = { width: this.width, height: this.height, type };
    return 'data:image/png;base64,shape-preview';
  });
});

afterEach(() => vi.restoreAllMocks());

describe('renderShapeTimelinePreview', () => {
  it('reuses the original text and drawing data while recentering the clip in source aspect', () => {
    const clip = shapeClip();
    const canvas = { width: 3_840, height: 2_160 };

    expect(renderShapeTimelinePreview(clip, canvas)).toBe('data:image/png;base64,shape-preview');

    expect(renderers.drawShapeClip).toHaveBeenCalledTimes(1);
    const [target, renderedClip, viewport, transform] = renderers.drawShapeClip.mock.calls[0] ?? [];
    expect(target).toBe(context);
    expect(renderedClip).toBe(clip);
    expect(renderedClip?.text).toBe(clip.text);
    expect(renderedClip?.drawing).toBe(clip.drawing);
    expect(viewport).toMatchObject({ x: 0, y: 0 });
    expect(viewport!.width / viewport!.height).toBeCloseTo(canvas.width / canvas.height);
    expect(transform).toEqual({ ...clip.transform, x: 0, y: 0 });
    expect(context.translate).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
    expect(encodedSize).toMatchObject({ type: 'image/png' });
    expect(renderedCanvas).toMatchObject({ width: 1, height: 1 });
  });

  it('keeps the encoded bitmap within 320 by 96 pixels for large rotated elements', () => {
    renderShapeTimelinePreview(shapeClip(), { width: 7_680, height: 4_320 });

    expect(encodedSize).not.toBeNull();
    expect(encodedSize!.width).toBeGreaterThan(0);
    expect(encodedSize!.height).toBeGreaterThan(0);
    expect(encodedSize!.width).toBeLessThanOrEqual(320);
    expect(encodedSize!.height).toBeLessThanOrEqual(96);
    expect(renderedCanvas).toMatchObject({ width: 1, height: 1 });
  });

  it('releases the temporary bitmap when PNG encoding fails', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new Error('PNG encoding failed');
    });

    expect(() => renderShapeTimelinePreview(shapeClip(), { width: 1_920, height: 1_080 })).toThrow(
      'PNG encoding failed',
    );
    expect(renderedCanvas).toMatchObject({ width: 1, height: 1 });
  });

  it('rejects unavailable source dimensions before allocating a canvas', () => {
    expect(() => renderShapeTimelinePreview(shapeClip(), { width: 0, height: 1_080 })).toThrow(
      'The element preview dimensions are unavailable.',
    );
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(renderers.drawShapeClip).not.toHaveBeenCalled();
  });

  it('releases the temporary bitmap when a 2D context is unavailable', () => {
    contextAvailable = false;

    expect(() => renderShapeTimelinePreview(shapeClip(), { width: 1_920, height: 1_080 })).toThrow(
      'The element preview canvas is unavailable.',
    );
    expect(renderedCanvas).toMatchObject({ width: 1, height: 1 });
  });
});
