import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screenshotShape, screenshotState } from '../screenshot-state';
import { updateScreenshotLayer } from '../screenshot-layers';
import type { ScreenshotLayer } from '../screenshot-layer-types';
import type { ScreenshotRenderAssets } from '../screenshot-types';

const render = vi.hoisted(() => ({
  drawLayer: vi.fn(),
  compositedLayer: vi.fn(),
}));

vi.mock('../screenshot-layer-render', () => ({
  drawScreenshotLayer: render.drawLayer,
}));

vi.mock('../../composition/render-composited-layer', () => ({
  renderCompositedLayer: render.compositedLayer,
}));

import { createScreenshotDragRenderer } from '../screenshot-drag-renderer';

const makeState = (): ScreenshotState => {
  const state = screenshotState({
    id: 'screen-1',
    name: 'Screenshot',
    width: 1200,
    height: 800,
    source: 'project-media://screenshot/screen-1/source.png',
    preset: {
      editor: { schemaVersion: 1 },
      devices: {},
      export: { format: 'png', resolution: '1080p' },
      quickSnip: { automaticZoom: false },
    },
    state: null,
  });
  const lower = screenshotShape('rounded-rectangle', 'shape-lower');
  const selected = screenshotShape('ellipse', 'shape-selected');
  const upper = screenshotShape('arrow', 'shape-upper');
  state.shapes = [lower, selected, upper];
  state.canvas.watermark = { ...state.canvas.watermark!, enabled: true };
  return state;
};

const makeAssets = (): ScreenshotRenderAssets => ({
  image: {} as CanvasImageSource,
  background: null,
  logo: null,
  width: 1200,
  height: 800,
});

const createContext = (): Canvas2DContext =>
  ({
    canvas: {} as HTMLCanvasElement,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  }) as unknown as Canvas2DContext;

let offscreenContexts: Canvas2DContext[];
let failOffscreenContext: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  offscreenContexts = [];
  failOffscreenContext = false;
  render.compositedLayer.mockImplementation(
    (
      target: Canvas2DContext,
      layer: ScreenshotLayer,
      _width: number,
      _height: number,
      draw: (context: Canvas2DContext, backdrop?: CanvasImageSource) => void,
    ) => {
      const backdrop =
        layer.opacity !== 100 || layer.blendMode !== 'source-over'
          ? ({ layerId: layer.id } as unknown as CanvasImageSource)
          : undefined;
      draw(target, backdrop);
    },
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class TestOffscreenCanvas {
      width: number;
      height: number;
      readonly context = createContext();

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        offscreenContexts.push(this.context);
      }

      getContext() {
        return failOffscreenContext ? null : this.context;
      }
    },
  );
});

describe('createScreenshotDragRenderer', () => {
  it('renders the unchanged prefix once, then repaints only the selected layer and suffix', () => {
    const renderer = createScreenshotDragRenderer();
    const state = makeState();
    const assets = makeAssets();
    const target = createContext();

    renderer.draw(target, state, assets, 1200, 800, 'shape-selected');

    expect(render.drawLayer.mock.calls.map((call) => call[2].id)).toEqual([
      '__background__',
      'screenshot',
      'shape-lower',
      'shape-selected',
      'shape-upper',
      '__watermark__',
    ]);
    expect(offscreenContexts).toHaveLength(1);

    render.drawLayer.mockClear();
    render.compositedLayer.mockClear();
    renderer.draw(target, state, assets, 1200, 800, 'shape-selected');

    expect(render.drawLayer.mock.calls.map((call) => call[2].id)).toEqual([
      'shape-selected',
      'shape-upper',
      '__watermark__',
    ]);
    expect(render.compositedLayer.mock.calls.every((call) => call[0] === target)).toBe(true);
    expect(offscreenContexts).toHaveLength(1);
    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 1200, 800);
  });

  it('keeps the suffix back-to-front and forwards current blend settings, backdrop, and text editing state', () => {
    const renderer = createScreenshotDragRenderer();
    const state = makeState();
    const assets = makeAssets();
    const target = createContext();
    updateScreenshotLayer(state, 'shape-upper', { opacity: 42, blendMode: 'multiply' });

    renderer.draw(target, state, assets, 1200, 800, 'shape-selected', 'shape-upper');
    render.drawLayer.mockClear();
    render.compositedLayer.mockClear();
    updateScreenshotLayer(state, 'shape-upper', { opacity: 63, blendMode: 'screen' });

    renderer.draw(target, state, assets, 1200, 800, 'shape-selected', 'shape-upper');

    const suffix = render.compositedLayer.mock.calls;
    expect(suffix.map((call) => call[1].id)).toEqual(['shape-selected', 'shape-upper', '__watermark__']);
    expect(suffix[1]?.[1]).toMatchObject({ opacity: 63, blendMode: 'screen' });
    expect(render.drawLayer.mock.calls.map((call) => call[2].id)).toEqual([
      'shape-selected',
      'shape-upper',
      '__watermark__',
    ]);
    expect(render.drawLayer.mock.calls[1]?.[6]).toEqual({ layerId: 'shape-upper' });
    expect(render.drawLayer.mock.calls.every((call) => call[7] === 'shape-upper')).toBe(true);
  });

  it.each([['a new assets object', (assets: ScreenshotRenderAssets) => ({ ...assets })]])(
    'rebuilds the cached prefix for %s',
    (_label, changeAssets) => {
      const renderer = createScreenshotDragRenderer();
      const state = makeState();
      const assets = makeAssets();
      const target = createContext();

      renderer.draw(target, state, assets, 1200, 800, 'shape-selected', 'before');
      render.drawLayer.mockClear();

      const nextAssets = changeAssets(assets);
      renderer.draw(target, state, nextAssets, 1200, 800, 'shape-selected', 'before');

      expect(render.drawLayer.mock.calls.slice(0, 3).map((call) => call[2].id)).toEqual([
        '__background__',
        'screenshot',
        'shape-lower',
      ]);
      expect(offscreenContexts).toHaveLength(2);
    },
  );

  it('invalidates the prefix when dimensions, selection, or editing target changes', () => {
    const renderer = createScreenshotDragRenderer();
    const state = makeState();
    const assets = makeAssets();
    const target = createContext();

    renderer.draw(target, state, assets, 1200, 800, 'shape-selected', 'editing-a');
    for (const options of [
      { width: 1000, height: 800, selectedId: 'shape-selected', editingId: 'editing-a' },
      { width: 1000, height: 800, selectedId: 'shape-upper', editingId: 'editing-a' },
      { width: 1000, height: 800, selectedId: 'shape-upper', editingId: 'editing-b' },
    ]) {
      const before = render.drawLayer.mock.calls.length;
      renderer.draw(target, state, assets, options.width, options.height, options.selectedId, options.editingId);
      const prefix =
        options.selectedId === 'shape-selected'
          ? ['__background__', 'screenshot', 'shape-lower']
          : ['__background__', 'screenshot', 'shape-lower', 'shape-selected'];
      expect(render.drawLayer.mock.calls.slice(before, before + prefix.length).map((call) => call[2].id)).toEqual(
        prefix,
      );
    }
    expect(offscreenContexts).toHaveLength(4);
  });

  it('skips hidden layers in both the cached prefix and the live suffix', () => {
    const renderer = createScreenshotDragRenderer();
    const state = makeState();
    state.image.enabled = false;
    state.shapes[2]!.enabled = false;

    renderer.draw(createContext(), state, makeAssets(), 1200, 800, 'shape-selected');

    expect(render.drawLayer.mock.calls.map((call) => call[2].id)).toEqual([
      '__background__',
      'shape-lower',
      'shape-selected',
      '__watermark__',
    ]);
  });

  it('rebuilds the cached prefix after reset', () => {
    const renderer = createScreenshotDragRenderer();
    const state = makeState();
    const assets = makeAssets();
    const target = createContext();

    renderer.draw(target, state, assets, 1200, 800, 'shape-selected');
    renderer.reset();
    render.drawLayer.mockClear();
    renderer.draw(target, state, assets, 1200, 800, 'shape-selected');

    expect(render.drawLayer.mock.calls.slice(0, 3).map((call) => call[2].id)).toEqual([
      '__background__',
      'screenshot',
      'shape-lower',
    ]);
    expect(offscreenContexts).toHaveLength(2);
  });

  it('treats a missing selected layer as an empty prefix and still paints every visible layer', () => {
    const renderer = createScreenshotDragRenderer();
    const state = makeState();
    const assets = makeAssets();
    const target = createContext();

    renderer.draw(target, state, assets, 1200, 800, 'missing');
    expect(render.drawLayer.mock.calls.map((call) => call[2].id)).toEqual([
      '__background__',
      'screenshot',
      'shape-lower',
      'shape-selected',
      'shape-upper',
      '__watermark__',
    ]);

    render.drawLayer.mockClear();
    renderer.draw(target, state, assets, 1200, 800, 'missing');
    expect(render.drawLayer.mock.calls).toHaveLength(6);
    expect(offscreenContexts).toHaveLength(1);
  });

  it('reports an unavailable offscreen context without painting the destination', () => {
    const renderer = createScreenshotDragRenderer();
    const target = createContext();
    failOffscreenContext = true;

    expect(() => renderer.draw(target, makeState(), makeAssets(), 1200, 800, 'shape-selected')).toThrow(
      'Screenshot rendering unavailable.',
    );
    expect(target.clearRect).not.toHaveBeenCalled();
    expect(target.drawImage).not.toHaveBeenCalled();
  });
});
