import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Canvas2DContext } from '../canvas-types';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import { createGlassHighlight } from '@beam/engine/zoom/glass-highlight';
import { normalizeOutputCanvas } from '@beam/engine/layout/output-canvas';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

const fixture = vi.hoisted(() => {
  const scopes: Array<{
    upload: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const state = { missingContext: false };
  const createScene = () => {
    const ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      transform: vi.fn(),
      drawImage: vi.fn(),
    };
    return { width: 1, height: 1, getContext: vi.fn((_type: string) => (state.missingContext ? null : ctx)) };
  };
  const scenes: Array<ReturnType<typeof createScene>> = [];
  return { scopes, scenes, state, createScene };
});
vi.mock('../zoom/glass-highlight-gpu', () => ({
  GlassHighlightGpu: class {
    upload = vi.fn();
    render = vi.fn(() => ({ canvas: {}, x: 2, y: 4, width: 64, height: 64 }));
    dispose = vi.fn();
    constructor() {
      fixture.scopes.push(this);
    }
  },
  createGlassCanvas: () => {
    const scene = fixture.createScene();
    fixture.scenes.push(scene);
    return scene;
  },
}));
import { disposeGlassHighlights, renderGlassHighlights } from './glass-highlight-render';

function context(scale = 1) {
  const inverse = { a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -20, f: -30 };
  return {
    canvas: {},
    drawImage: vi.fn(),
    getTransform: () => ({ a: scale, b: 0, c: 0, d: scale, inverse: () => inverse }),
  } as unknown as Canvas2DContext;
}
function snapshot() {
  const lens: ZoomElement = {
    ...createManualZoom('lens', 0, 1000),
    effect: 'glass' as const,
    depth: 6 as const,
    glass: { ...createGlassHighlight(), transitionMs: 0 },
  };
  return { canvas: normalizeOutputCanvas({ preset: 'custom', width: 256, height: 144 }), zooms: [lens] };
}
afterEach(() => {
  disposeGlassHighlights();
  fixture.scopes.length = fixture.scenes.length = 0;
  fixture.state.missingContext = false;
});
describe('sharp lens scene preparation', () => {
  it('does no GPU work without a visible lens, including outside its interval', () => {
    const ctx = context();
    renderGlassHighlights(ctx, { ...snapshot(), zooms: [] }, 500);
    renderGlassHighlights(ctx, snapshot(), 1000);
    expect(fixture.scopes).toHaveLength(0);
  });
  it('rerenders original sources at magnification and device density, keeping logical lens coordinates', () => {
    const ctx = context(2),
      draw = vi.fn();
    renderGlassHighlights(ctx, snapshot(), 500, undefined, { draw, dispose: vi.fn() });
    expect(draw).toHaveBeenCalledWith(fixture.scenes[0]!.getContext('2d'), 2560, 1440);
    expect(fixture.scopes[0]!.upload).toHaveBeenCalledWith(fixture.scenes[0], 2560, 1440, 256, 144);
    expect(fixture.scopes[0]!.render).toHaveBeenCalledWith(
      expect.objectContaining({ magnification: 5, center: { x: 128, y: 72 } }),
      2,
    );
    expect(ctx.drawImage).toHaveBeenCalledWith({}, 2, 4, 64, 64);
  });
  it('captures an explicit raster backdrop and cancels translated/scaled preview coordinates', () => {
    const ctx = context(2),
      backdrop = {} as CanvasImageSource;
    renderGlassHighlights(ctx, snapshot(), 500, backdrop);
    const capture = fixture.scenes[0]!.getContext('2d')!;
    expect(capture.scale).toHaveBeenCalledWith(10, 10);
    expect(capture.transform).toHaveBeenCalledWith(0.5, 0, 0, 0.5, -20, -30);
    expect(capture.drawImage).toHaveBeenCalledWith(backdrop, 0, 0);
    expect(capture.restore).toHaveBeenCalledOnce();
  });
  it('shares one current scene between simultaneous lenses, rerenders new pixels on reuse and reverse seeks', () => {
    const ctx = context(),
      s = snapshot();
    s.zooms.push({ ...s.zooms[0]!, id: 'second' });
    renderGlassHighlights(ctx, s, 500);
    renderGlassHighlights(ctx, s, 10);
    expect(fixture.scopes).toHaveLength(1);
    expect(fixture.scopes[0]!.upload).toHaveBeenCalledTimes(2);
    expect(fixture.scopes[0]!.render).toHaveBeenCalledTimes(4);
    expect(fixture.scenes[0]!.getContext('2d')!.drawImage).toHaveBeenCalledWith(ctx.canvas, 0, 0);
  });
  it('isolates nested and separate output contexts and releases only the requested owner', () => {
    const a = context(),
      b = context();
    renderGlassHighlights(a, snapshot(), 500, undefined, {
      draw: () => renderGlassHighlights(b, snapshot(), 500),
      dispose: (capture) => disposeGlassHighlights(capture),
    });
    expect(fixture.scopes).toHaveLength(2);
    disposeGlassHighlights(a);
    expect(fixture.scopes[0]!.dispose).toHaveBeenCalledOnce();
    expect(fixture.scopes[1]!.dispose).not.toHaveBeenCalled();
    expect(fixture.scenes[0]!.width).toBe(0);
    disposeGlassHighlights();
    expect(fixture.scopes[1]!.dispose).toHaveBeenCalledOnce();
    expect(() => disposeGlassHighlights()).not.toThrow();
  });
  it('releases nested scene resources through their painter, including isolated blend surfaces', () => {
    const owner = context(),
      child = context();
    const dispose = vi.fn(() => disposeGlassHighlights(child));
    renderGlassHighlights(owner, snapshot(), 500, undefined, {
      draw: () => renderGlassHighlights(child, snapshot(), 500),
      dispose,
    });
    disposeGlassHighlights(owner);
    expect(dispose).toHaveBeenCalledWith(fixture.scenes[0]!.getContext('2d'));
    expect(fixture.scopes.every((scope) => scope.dispose.mock.calls.length === 1)).toBe(true);
    expect(fixture.scenes.every((scene) => scene.width === 0 && scene.height === 0)).toBe(true);
  });
  it('resizes a reused source after density changes and reports a missing scene context', () => {
    const ctx = context();
    renderGlassHighlights(ctx, snapshot(), 500);
    const s = snapshot();
    s.zooms[0]!.depth = 2;
    renderGlassHighlights(ctx, s, 500);
    expect(fixture.scenes[0]).toMatchObject({ width: 512, height: 288 });
    fixture.state.missingContext = true;
    expect(() => renderGlassHighlights(ctx, s, 500)).toThrow('scene surface unavailable');
  });
});
