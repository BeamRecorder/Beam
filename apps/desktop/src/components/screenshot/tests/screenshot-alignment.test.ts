import { describe, expect, it } from 'vitest';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import { createStillCommands } from '@beam/engine/screenshot/still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createScreenshotAlignment } from '../screenshot-alignment';
import { screenshotLayerTransform } from '../screenshot-layer-geometry';
import { constrainScreenshotTranslation, withScreenshotTranslation } from '../screenshot-selection-transform';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
const fixture = () => {
  let doc = createStillDocument('project', 'source', 1920, 1080);
  doc.state.image.enabled = false;
  const r = createStillCommands();
  for (const [i, id] of ['a', 'b', 'c'].entries())
    doc = r.execute(doc, {
      type: 'still.layer.add',
      payload: {
        ...doc.state.image,
        ...DEFAULT_SHAPE_LAYER_STYLE,
        id,
        kind: 'shape',
        assetId: '',
        enabled: true,
        transform: { x: 0.2 + i * 0.2, y: 0.2, width: 0.1, height: 0.1 },
      },
    });
  return doc.state;
};
describe('Screenshot gesture alignment', () => {
  it.each([-5, 5])('keeps the cropped image visible when dragging by %s', (x) => {
    const state = createStillDocument('project', 'source', 1920, 1080).state;
    state.canvas = { ...state.canvas, width: 1920, height: 1080 };
    state.image.transform = { x: 0.1, y: 0, width: 1, height: 1 };
    state.image.crop = { x: 0.2, y: 0, width: 0.1, height: 1 };
    const assets: ScreenshotRenderAssets = {
      image: {} as CanvasImageSource,
      background: null,
      logo: null,
      width: 1920,
      height: 1080,
    };
    const snap = createScreenshotAlignment(state, assets, [state.image.id], { width: 400, height: 225 });
    const expected = x < 0 ? -0.64 : 0.44;
    expect(snap({ x, y: 0 }).translation.x).toBeCloseTo(expected);
    expect(snap({ x, y: 0 }).guides).toEqual([]);
    expect(constrainScreenshotTranslation(state, [state.image.id], { x, y: 0 }, assets).x).toBeCloseTo(expected);
    const moved = withScreenshotTranslation(state, [state.image.id], snap({ x, y: 0 }).translation);
    const visible = screenshotLayerTransform(moved, assets, state.image.id)!;
    expect(x < 0 ? visible.x + visible.width : visible.x).toBeCloseTo(x < 0 ? 0.01 : 0.99);
    expect(moved.image.transform.width).toBe(1);
    expect(moved.image.crop).toEqual(state.image.crop);
    expect(assets.width).toBe(1920);
  });

  it('refreshes cropped edges after changing or resetting the crop', () => {
    const state = createStillDocument('project', 'source', 1920, 1080).state;
    state.canvas = { ...state.canvas, width: 1920, height: 1080 };
    state.image.transform = { x: 0.1, y: 0, width: 0.8, height: 0.8 };
    const assets: ScreenshotRenderAssets = {
      image: {} as CanvasImageSource,
      background: null,
      logo: null,
      width: 1920,
      height: 1080,
    };
    for (const width of [0.5, 0.25, 1]) {
      state.image.crop = width === 1 ? undefined : { x: 0, y: 0, width, height: 1 };
      const visibleWidth = 0.8 * width;
      const visibleLeft = 0.5 - visibleWidth / 2;
      const snap = createScreenshotAlignment(state, assets, [state.image.id], { width: 960, height: 540 });
      const result = snap({ x: -visibleLeft + 0.002, y: 0 });
      expect(result.translation.x).toBeCloseTo(-visibleLeft);
      expect(result.guides).toContainEqual({ type: 'vertical', position: 0 });
      expect(state.image.transform).toEqual({ x: 0.1, y: 0, width: 0.8, height: 0.8 });
    }
  });

  it('snaps one layer against all other layers, including locked reference layers', () => {
    const state = fixture();
    state.composition!.find((r) => r.id === 'b')!.locked = true;
    const snap = createScreenshotAlignment(state, null, ['a'], { width: 960, height: 540 });
    const r = snap({ x: 0.198, y: 0 });
    expect(r.translation.x).toBeCloseTo(0.2);
    expect(r.guides).toContainEqual({ type: 'vertical', position: 0.4 });
    expect(r.measurements[0]!.pixels).toBeCloseTo(192);
  });
  it('keeps group spacing and uses a six-screen-pixel tolerance independent of canvas zoom', () => {
    const state = fixture();
    const fit = createScreenshotAlignment(state, null, ['a', 'b'], { width: 960, height: 540 }),
      zoom = createScreenshotAlignment(state, null, ['a', 'b'], { width: 1920, height: 1080 });
    expect(fit({ x: 0.095, y: 0 }).translation.x).toBeCloseTo(0.1);
    expect(zoom({ x: 0.095, y: 0 }).translation.x).toBeCloseTo(0.095);
  });
  it('can bypass snapping while still showing exact measurements', () => {
    const snap = createScreenshotAlignment(fixture(), null, ['a'], { width: 960, height: 540 });
    const r = snap({ x: 0.198, y: 0 }, true);
    expect(r.translation.x).toBeCloseTo(0.198);
    expect(r.guides).toEqual([]);
    expect(r.measurements.length).toBeGreaterThan(1);
  });
  it('handles an empty or locked selection and constrains a drag at canvas boundaries', () => {
    const state = fixture();
    const snap = createScreenshotAlignment(state, null, ['a'], { width: 960, height: 540 });
    expect(snap({ x: 5, y: 0 }).translation.x).toBeCloseTo(0.79);
    expect(createScreenshotAlignment(state, null, [], { width: 960, height: 540 })({ x: 1, y: 1 })).toEqual({
      translation: { x: 0, y: 0 },
      guides: [],
      measurements: [],
    });
    state.composition!.find((layer) => layer.id === 'a')!.locked = true;
    expect(
      createScreenshotAlignment(state, null, ['a'], { width: 960, height: 540 })({ x: 1, y: 1 }).translation,
    ).toEqual({ x: 0, y: 0 });
  });
});
