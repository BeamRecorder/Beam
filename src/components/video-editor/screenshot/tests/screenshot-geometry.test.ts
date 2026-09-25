import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTPUT_CANVAS, normalizeOutputCanvas } from '../../canvas/output-canvas';
import { screenshotState } from '../screenshot-state';
import { screenshotImageFraming, moveScreenshotCrop, resizeScreenshotImage } from '../screenshot-geometry';
import { resizeScreenshotCanvas, screenshotCanvasPreset, validScreenshotDimensions } from '../screenshot-dimensions';

const canvas = { ...DEFAULT_OUTPUT_CANVAS, width: 1200, height: 800 };

describe('screenshot output dimensions', () => {
  it('locks the other dimension proportionally or leaves it independent', () => {
    expect(resizeScreenshotCanvas(canvas, 'width', '1800', true)).toMatchObject({ width: 1800, height: 1200 });
    expect(resizeScreenshotCanvas(canvas, 'height', 400, true)).toMatchObject({ width: 600, height: 400 });
    expect(resizeScreenshotCanvas(canvas, 'height', 400, false)).toMatchObject({ width: 1200, height: 400 });
  });
  it('preserves the starting aspect through intermediate width and height edits', () => {
    const narrow = resizeScreenshotCanvas(canvas, 'width', '6', true, canvas);
    const wider = resizeScreenshotCanvas(narrow, 'width', '60', true, canvas);
    expect(resizeScreenshotCanvas(wider, 'width', '600', true, canvas)).toMatchObject({ width: 600, height: 400 });

    const short = resizeScreenshotCanvas(canvas, 'height', '4', true, canvas);
    expect(resizeScreenshotCanvas(short, 'height', '400', true, canvas)).toMatchObject({ width: 600, height: 400 });
  });
  it('uses a new aspect source for a later edit', () => {
    const square = screenshotCanvasPreset(canvas, '1:1', { width: 1200, height: 800 });
    expect(resizeScreenshotCanvas(square, 'width', 540, true, square)).toMatchObject({ width: 540, height: 540 });
  });
  it.each(['', 'bad', 'Infinity', '0', '-1', '120.5', '16385'])(
    'rejects invalid dimensions (%s) without changing the canvas',
    (value) => {
      expect(resizeScreenshotCanvas(canvas, 'width', value, false)).toBe(canvas);
    },
  );
  it('rejects excessive pixel counts including the aspect-locked opposite side', () => {
    expect(resizeScreenshotCanvas(canvas, 'width', 16384, true)).toBe(canvas);
    expect(validScreenshotDimensions({ width: 8192, height: 8192 })).toBe(true);
    expect(validScreenshotDimensions({ width: 8193, height: 8192 })).toBe(false);
    expect(resizeScreenshotCanvas({ ...canvas, width: 1, height: 16384 }, 'width', 2, true).height).toBe(16384);
  });
  it('preserves background and watermark and survives normalizing a resized preset', () => {
    const square = screenshotCanvasPreset(canvas, '1:1', { width: 1200, height: 800 });
    expect(square).toMatchObject({ width: 1080, height: 1080, preset: 'custom' });
    expect(square.watermark).toEqual(canvas.watermark);
    expect(normalizeOutputCanvas(resizeScreenshotCanvas(square, 'width', 2000, false))).toMatchObject({
      width: 2000,
      height: 1080,
    });
    expect(screenshotCanvasPreset(square, 'original', { width: 1200, height: 800 })).toMatchObject({
      width: 1200,
      height: 800,
    });
    expect(screenshotCanvasPreset(canvas, 'unknown', { width: 1200, height: 800 })).toBe(canvas);
    expect(screenshotCanvasPreset(canvas, 'original', { width: 0, height: 0 })).toBe(canvas);
  });
});

describe('screenshot source cropping', () => {
  const initial = { x: 0.2, y: 0.1, width: 0.6, height: 0.7 };
  it('keeps dragged crops inside the source', () => {
    expect(moveScreenshotCrop(initial, -1, 1)).toMatchObject({ x: 0, width: 0.6, height: 0.7 });
    expect(moveScreenshotCrop(initial, -1, 1).y).toBeCloseTo(0.3);
  });
  it('anchors the opposite corner when resizing past source boundaries or minimum size', () => {
    const expanded = moveScreenshotCrop(initial, -1, -1, 'top-left');
    expect(expanded.x).toBe(0);
    expect(expanded.y).toBe(0);
    expect(expanded.width).toBeCloseTo(0.8);
    expect(expanded.height).toBeCloseTo(0.8);
    const collapsed = moveScreenshotCrop(initial, 1, 1, 'top-left');
    expect(collapsed.width).toBeCloseTo(0.05);
    expect(collapsed.height).toBeCloseTo(0.05);
    expect(collapsed.x + collapsed.width).toBeCloseTo(0.8);
    const bottom = moveScreenshotCrop(initial, 1, 1, 'bottom-right');
    expect(bottom.x).toBe(0.2);
    expect(bottom.y).toBe(0.1);
    expect(bottom.width).toBeCloseTo(0.8);
    expect(bottom.height).toBeCloseTo(0.9);
  });
  it('moves only the requested edge', () => {
    const right = moveScreenshotCrop(initial, 0.1, 0.3, 'right');
    expect(right.y).toBe(initial.y);
    expect(right.height).toBeCloseTo(initial.height);
    expect(right.width).toBeCloseTo(0.7);
    const top = moveScreenshotCrop(initial, 0.4, -0.1, 'top');
    expect(top.x).toBe(initial.x);
    expect(top.width).toBeCloseTo(initial.width);
    expect(top.y).toBe(0);
    expect(top.height).toBeCloseTo(0.8);
  });
  it('fits the cropped pixels without stretching and exposes the full image while editing', () => {
    const state = screenshotState({
      id: 'test',
      name: 'test',
      source: 'test.png',
      width: 2000,
      height: 1000,
      state: null,
      preset: { editor: { schemaVersion: 1 }, devices: {}, export: {}, quickSnip: { automaticZoom: false } },
    });
    state.image.crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
    expect(screenshotImageFraming(state, 2000, 1000, 1000, 500)).toEqual({
      rect: { x: 250, y: 0, width: 500, height: 500 },
      sourceRect: { x: 500, y: 0, width: 1000, height: 1000 },
    });
    expect(screenshotImageFraming(state, 2000, 1000, 1000, 500, true)).toEqual({
      rect: { x: 0, y: 0, width: 1000, height: 500 },
      sourceRect: { x: 0, y: 0, width: 2000, height: 1000 },
    });
  });
});

describe('resizing the visible screenshot', () => {
  it('follows a fitted image edge while preserving its aspect and opposite anchor', () => {
    const visible = { x: 0.25, y: 0, width: 0.5, height: 1 };
    const resized = resizeScreenshotImage(visible, visible, 0.1, 0, 'right');
    expect(resized).toMatchObject({ x: 0.25, width: 0.6, height: 1.2 });
    expect(resized.y).toBeCloseTo(-0.1);
    const corner = resizeScreenshotImage(visible, visible, -0.1, 0, 'top-left');
    expect(corner.x + corner.width).toBeCloseTo(0.75);
    expect(corner.y + corner.height).toBeCloseTo(1);
  });
  it('maps phone frame handle movement back to the contained source rectangle', () => {
    const outer = { x: 0.3, y: 0.2, width: 0.2, height: 0.6 };
    const source = { x: 0.2, y: 0.2, width: 0.4, height: 0.6 };
    const resized = resizeScreenshotImage(outer, source, 0.1, 0.3, 'bottom-right');
    expect(resized.x).toBeCloseTo(0.15);
    expect(resized.y).toBeCloseTo(0.2);
    expect(resized.width).toBeCloseTo(0.6);
    expect(resized.height).toBeCloseTo(0.9);
  });
  it('clamps excessive resizing and grows proportionally from a vertical edge', () => {
    const initial = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(resizeScreenshotImage(initial, initial, 100, 100, 'bottom-right').width).toBe(2);
    expect(resizeScreenshotImage(initial, initial, -100, 0, 'right').width).toBeCloseTo(0.02);
    expect(resizeScreenshotImage(initial, initial, 0, 0.25, 'bottom')).toMatchObject({
      x: 0.125,
      y: 0.25,
      width: 0.75,
      height: 0.75,
    });
  });
});
