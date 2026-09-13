import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { BlurClip, NormalizedTransform } from '~/media/shared/composition-types';
import { defaultLayerCompositing } from '~/media/shared/layer-compositing';
import type { Canvas2DContext } from '~/types/canvas';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { screenshotLayerAt, screenshotLayerTransform } from '../screenshot-layer-geometry';
import { removeScreenshotLayer, screenshotLayers, setScreenshotLayerVisible } from '../screenshot-layers';
import { drawScreenshotLayer } from '../screenshot-layer-render';
import type { ScreenshotLayer } from '../screenshot-layer-types';
import { withScreenshotTransform } from '../screenshot-transform';
import { screenshotThumbnailSpecs } from '../composition/thumbnails/thumbnail-spec';

const effectRenderer = vi.hoisted(() => ({ applyBlurEffect: vi.fn() }));

vi.mock('../../composition/effects/blur-effect', () => ({ applyBlurEffect: effectRenderer.applyBlurEffect }));

const makeEffect = (
  id: string,
  transform: NormalizedTransform = { x: 0.2, y: 0.25, width: 0.3, height: 0.4 },
): BlurClip => ({
  id,
  assetId: id,
  kind: 'blur',
  name: `Highlight ${id}`,
  timelineStartMs: 0,
  timelineDurationMs: 1,
  sourceInMs: 0,
  sourceDurationMs: 1,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform,
  shape: 'rectangle',
  mode: 'highlight',
  strength: 65,
  feather: 0,
  cornerRadius: 8,
  tintOpacity: 0,
  color: '#ffcc00',
});

const makeState = (overrides: Partial<ScreenshotState> = {}): ScreenshotState => ({
  canvas: {
    ...DEFAULT_OUTPUT_CANVAS,
    preset: 'custom',
    width: 1_000,
    height: 500,
    showBackground: false,
    watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: false },
  },
  background: null,
  blurPercent: 0,
  image: { id: 'screenshot', name: 'Captured screen', enabled: false } as ScreenshotState['image'],
  shapes: [],
  effects: [],
  format: 'png',
  quality: 0.9,
  ...overrides,
});

const effectOrder = (...ids: string[]) => ids.map((id) => defaultLayerCompositing(id));
const effectLayer = (id: string): ScreenshotLayer => ({
  ...defaultLayerCompositing(id),
  id,
  kind: 'effect',
  name: `Highlight ${id}`,
  visible: true,
});

beforeEach(() => vi.clearAllMocks());

describe('screenshot highlight layers', () => {
  it('derives effect layers and exposes their rectangular transform for hit testing', () => {
    const effect = makeEffect('highlight-1');
    const state = makeState({ effects: [effect], composition: effectOrder(effect.id) });

    expect(screenshotLayers(state)).toMatchObject([
      { id: effect.id, kind: 'effect', name: effect.name, visible: true },
    ]);
    expect(screenshotLayerTransform(state, null, effect.id)).toEqual(effect.transform);
    expect(screenshotLayerAt(state, null, 0.35, 0.4)).toBe(effect.id);
    expect(screenshotLayerAt(state, null, 0.1, 0.4)).toBeNull();
  });

  it('uses composition order and skips hidden or locked highlight layers', () => {
    const lower = makeEffect('lower');
    const upper = makeEffect('upper');
    const state = makeState({ effects: [lower, upper], composition: effectOrder(lower.id, upper.id) });

    expect(screenshotLayerAt(state, null, 0.35, 0.4)).toBe(upper.id);

    state.composition![1]!.locked = true;
    expect(screenshotLayerAt(state, null, 0.35, 0.4)).toBe(lower.id);

    state.composition![1]!.locked = false;
    upper.enabled = false;
    expect(screenshotLayerAt(state, null, 0.35, 0.4)).toBe(lower.id);

    upper.enabled = true;
    state.composition!.reverse();
    expect(screenshotLayerAt(state, null, 0.35, 0.4)).toBe(lower.id);
  });

  it('changes visibility and removes only the requested highlight layer and order entry', () => {
    const kept = makeEffect('kept');
    const removed = makeEffect('removed');
    const state = makeState({ effects: [kept, removed], composition: effectOrder(kept.id, removed.id) });

    setScreenshotLayerVisible(state, removed.id, false);
    expect(removed.enabled).toBe(false);
    expect(screenshotLayers(state).find(({ id }) => id === removed.id)?.visible).toBe(false);

    setScreenshotLayerVisible(state, removed.id, true);
    removeScreenshotLayer(state, removed.id);

    expect(state.effects).toEqual([kept]);
    expect(state.composition?.map(({ id }) => id)).toEqual([kept.id]);
    expect(kept.enabled).toBe(true);
  });

  it('updates only the matching effect transform without mutating the source state', () => {
    const first = makeEffect('first');
    const second = makeEffect('second');
    const state = makeState({ effects: [first, second] });
    const transform = { x: 0.55, y: 0.5, width: 0.25, height: 0.2 };
    const snapshot = structuredClone(state);

    const next = withScreenshotTransform(state, first.id, transform, null);

    expect(next.effects).not.toBe(state.effects);
    expect(next.effects?.[0]).not.toBe(first);
    expect(next.effects?.[0]?.transform).toEqual(transform);
    expect(next.effects?.[1]).toBe(second);
    expect(state).toEqual(snapshot);
  });

  it('renders an effect through applyBlurEffect with the output-scaled rectangle', () => {
    const effect = makeEffect('highlight-1', { x: 0.2, y: 0.3, width: 0.3, height: 0.4 });
    const state = makeState({ effects: [effect], composition: effectOrder(effect.id) });
    const target = {} as Canvas2DContext;
    const backdrop = {} as CanvasImageSource;

    drawScreenshotLayer(target, state, effectLayer(effect.id), {}, 400, 200, backdrop);

    expect(effectRenderer.applyBlurEffect).toHaveBeenCalledOnce();
    expect(effectRenderer.applyBlurEffect).toHaveBeenCalledWith(
      target,
      effect,
      { x: 80, y: 60, width: 120, height: 80 },
      { source: backdrop },
    );
    expect(() => drawScreenshotLayer(target, state, effectLayer('missing'), {}, 400, 200)).toThrow(
      'Screenshot effect unavailable: missing',
    );
  });

  it('isolates an effect thumbnail and invalidates its key for strength, color, and placement changes', () => {
    const effect = makeEffect('highlight-1');
    const state = makeState({ effects: [effect], composition: effectOrder(effect.id) });
    const original = screenshotThumbnailSpecs(state, 'capture.png', []).find(({ id }) => id === effect.id)!;

    expect(original.layer.kind).toBe('effect');
    expect(original.state.effects).toEqual([effect]);
    expect(original.state.shapes).toEqual([]);

    const changedKey = (change: (target: BlurClip) => void) => {
      const changed = structuredClone(state);
      change(changed.effects![0]!);
      return screenshotThumbnailSpecs(changed, 'capture.png', []).find(({ id }) => id === effect.id)?.key;
    };

    expect(changedKey((target) => (target.strength = 80))).not.toBe(original.key);
    expect(changedKey((target) => (target.color = '#3366ff'))).not.toBe(original.key);
    expect(changedKey((target) => (target.highlightColor = '#ffeeaa'))).not.toBe(original.key);
    expect(changedKey((target) => (target.tintOpacity = 30))).not.toBe(original.key);
    expect(changedKey((target) => (target.transform.x += 0.1))).not.toBe(original.key);
  });
});
