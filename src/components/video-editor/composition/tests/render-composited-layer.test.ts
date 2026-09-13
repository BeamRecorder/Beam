import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerBlendMode, LayerCompositing } from '~/media/shared/layer-compositing-types';
import type { Canvas2DContext } from '~/types/canvas';
import { releaseCompositedLayerSurface, renderCompositedLayer } from '../render-composited-layer';

class MockContext {
  readonly canvas: { width: number; height: number };
  readonly clearRect = vi.fn();
  readonly drawImage = vi.fn();
  readonly save = vi.fn(() => this.stack.push([this.alpha, this.operation]));
  readonly restore = vi.fn(() => {
    const state = this.stack.pop();
    if (state) {
      this.alpha = state[0];
      this.operation = state[1];
    }
  });
  readonly compositeAssignments: string[] = [];
  readonly alphaAssignments: number[] = [];
  private stack: Array<[number, string]> = [];
  private alpha = 1;
  private operation = 'source-over';

  constructor(canvas: { width: number; height: number }) {
    this.canvas = canvas;
  }

  get globalAlpha() {
    return this.alpha;
  }

  set globalAlpha(value: number) {
    this.alphaAssignments.push(value);
    this.alpha = value;
  }

  get globalCompositeOperation() {
    return this.operation;
  }

  set globalCompositeOperation(value: string) {
    this.compositeAssignments.push(value);
    this.operation = value;
  }
}

class MockOffscreenCanvas {
  width: number;
  height: number;
  readonly context: MockContext | null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = hasContext ? new MockContext(this) : null;
    surfaces.push(this);
  }

  getContext() {
    return this.context as unknown as OffscreenCanvasRenderingContext2D | null;
  }
}

const supportedModes: LayerBlendMode[] = [
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'lighter',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

let surfaces: MockOffscreenCanvas[] = [];
let hasContext = true;

const outputContext = (width = 640, height = 480) => new MockContext({ width, height }) as unknown as Canvas2DContext;

const layer = (overrides: Partial<LayerCompositing> = {}): LayerCompositing => ({
  id: 'layer-1',
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
  ...overrides,
});

beforeEach(() => {
  surfaces = [];
  hasContext = true;
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
});

afterEach(() => vi.unstubAllGlobals());

describe('renderCompositedLayer', () => {
  it('flattens overlapping drawing before applying layer opacity once', () => {
    const output = outputContext() as unknown as MockContext;
    const draw = vi.fn((target: Canvas2DContext) => {
      expect(target.globalAlpha).toBe(1);
      (target as unknown as MockContext).drawImage('first-overlap', 0, 0);
      (target as unknown as MockContext).drawImage('second-overlap', 10, 10);
    });

    renderCompositedLayer(output as unknown as Canvas2DContext, layer({ opacity: 35 }), 640, 480, draw);

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.context!.drawImage).toHaveBeenCalledTimes(2);
    expect(output.drawImage).toHaveBeenCalledWith(surfaces[0], 0, 0);
    expect(output.alphaAssignments).toHaveLength(1);
    expect(output.alphaAssignments[0]).toBeCloseTo(0.35);
    expect(output.globalAlpha).toBe(1);
    expect(output.compositeAssignments).toContain('source-over');
    expect(draw).toHaveBeenCalledWith(surfaces[0]!.context, output.canvas);
    expect(surfaces[0]!.context!.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
  });

  it.each(supportedModes)('passes the supported Canvas blend mode %s to the destination', (blendMode) => {
    const output = outputContext() as unknown as MockContext;
    const draw = vi.fn();

    renderCompositedLayer(output as unknown as Canvas2DContext, layer({ opacity: 60, blendMode }), 640, 480, draw);

    expect(output.compositeAssignments).toContain(blendMode);
    expect(output.drawImage).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalledOnce();
  });

  it('skips fully transparent layers before allocating a surface or calling the renderer', () => {
    const output = outputContext();
    const draw = vi.fn();

    renderCompositedLayer(output, layer({ opacity: 0, blendMode: 'multiply' }), 640, 480, draw);

    expect(surfaces).toHaveLength(0);
    expect(draw).not.toHaveBeenCalled();
    expect((output as unknown as MockContext).drawImage).not.toHaveBeenCalled();
  });

  it('draws normal fully opaque layers directly while restoring the destination context', () => {
    const output = outputContext() as unknown as MockContext;
    const draw = vi.fn();

    renderCompositedLayer(output as unknown as Canvas2DContext, layer(), 640, 480, draw);

    expect(surfaces).toHaveLength(0);
    expect(draw).toHaveBeenCalledWith(output, output.canvas);
    expect(output.save).toHaveBeenCalledOnce();
    expect(output.restore).toHaveBeenCalledOnce();
  });

  it('reuses one cached surface per destination and resizes it when either dimension changes', () => {
    const output = outputContext() as unknown as Canvas2DContext;
    const draw = vi.fn();
    const composited = layer({ blendMode: 'multiply' });

    renderCompositedLayer(output, composited, 320, 200, draw);
    renderCompositedLayer(output, composited, 320, 200, draw);
    renderCompositedLayer(output, composited, 640, 200, draw);
    renderCompositedLayer(output, composited, 640, 360, draw);

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({ width: 640, height: 360 });
    expect(surfaces[0]!.context!.clearRect).toHaveBeenLastCalledWith(0, 0, 640, 360);

    renderCompositedLayer(outputContext() as unknown as Canvas2DContext, composited, 640, 360, draw);
    expect(surfaces).toHaveLength(2);
  });

  it('releases only its destination surface, is idempotent, and allocates a fresh surface afterward', () => {
    const firstOutput = outputContext() as unknown as Canvas2DContext;
    const secondOutput = outputContext() as unknown as Canvas2DContext;
    const composited = layer({ opacity: 50, blendMode: 'multiply' });
    const draw = vi.fn();

    renderCompositedLayer(firstOutput, composited, 640, 480, draw);
    renderCompositedLayer(secondOutput, composited, 640, 480, draw);
    const [firstSurface, secondSurface] = surfaces;
    expect(firstSurface).toMatchObject({ width: 640, height: 480 });
    expect(secondSurface).toMatchObject({ width: 640, height: 480 });

    releaseCompositedLayerSurface(firstOutput);
    expect(firstSurface).toMatchObject({ width: 0, height: 0 });
    expect(secondSurface).toMatchObject({ width: 640, height: 480 });
    expect(() => releaseCompositedLayerSurface(firstOutput)).not.toThrow();
    renderCompositedLayer(secondOutput, composited, 640, 480, draw);
    expect(surfaces).toHaveLength(2);

    renderCompositedLayer(firstOutput, composited, 640, 480, draw);
    expect(surfaces).toHaveLength(3);
    expect(surfaces[2]).not.toBe(firstSurface);
    expect(surfaces[2]).toMatchObject({ width: 640, height: 480 });
    expect(() => releaseCompositedLayerSurface(outputContext())).not.toThrow();
    releaseCompositedLayerSurface(firstOutput);
    expect(surfaces[2]).toMatchObject({ width: 0, height: 0 });
  });

  it('throws if the cached surface cannot provide a 2D context', () => {
    hasContext = false;
    const output = outputContext();
    const draw = vi.fn();

    expect(() => renderCompositedLayer(output, layer({ opacity: 50 }), 640, 480, draw)).toThrow(
      'Layer rendering context unavailable.',
    );
    expect(draw).not.toHaveBeenCalled();
    expect((output as unknown as MockContext).drawImage).not.toHaveBeenCalled();
  });

  it('restores the layer context when drawing fails and reuses the surface on retry', () => {
    const output = outputContext() as unknown as Canvas2DContext;
    const firstSurfaceDraw = vi.fn(() => {
      throw new Error('layer draw failed');
    });

    expect(() => renderCompositedLayer(output, layer({ opacity: 50 }), 640, 480, firstSurfaceDraw)).toThrow(
      'layer draw failed',
    );
    expect(surfaces[0]!.context!.save).toHaveBeenCalledOnce();
    expect(surfaces[0]!.context!.restore).toHaveBeenCalledOnce();
    expect((output as unknown as MockContext).restore).not.toHaveBeenCalled();

    renderCompositedLayer(output, layer({ opacity: 50 }), 640, 480, vi.fn());
    expect(surfaces).toHaveLength(1);
    expect((output as unknown as MockContext).drawImage).toHaveBeenCalledOnce();
  });

  it('restores output alpha and blend state when destination composition throws', () => {
    const output = outputContext() as unknown as MockContext;
    output.globalAlpha = 0.8;
    output.globalCompositeOperation = 'lighter';
    output.drawImage.mockImplementationOnce(() => {
      throw new Error('destination draw failed');
    });

    expect(() =>
      renderCompositedLayer(
        output as unknown as Canvas2DContext,
        layer({ opacity: 50, blendMode: 'screen' }),
        640,
        480,
        vi.fn(),
      ),
    ).toThrow('destination draw failed');

    expect(output.globalAlpha).toBe(0.8);
    expect(output.globalCompositeOperation).toBe('lighter');
    expect(output.restore).toHaveBeenCalledOnce();
  });

  it('restores the destination context when the direct renderer throws', () => {
    const output = outputContext() as unknown as MockContext;

    expect(() =>
      renderCompositedLayer(output as unknown as Canvas2DContext, layer(), 640, 480, () => {
        throw new Error('direct draw failed');
      }),
    ).toThrow('direct draw failed');

    expect(output.save).toHaveBeenCalledOnce();
    expect(output.restore).toHaveBeenCalledOnce();
  });

  it('passes the original destination canvas as backdrop while rendering offscreen', () => {
    const output = outputContext() as unknown as Canvas2DContext;
    const draw = vi.fn();

    renderCompositedLayer(output, layer({ opacity: 40, blendMode: 'overlay' }), 640, 480, draw);

    expect(draw.mock.calls[0]![1]).toBe(output.canvas);
    expect(draw.mock.calls[0]![0]).not.toBe(output);
  });
});
