import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { disposeExportMotionBlurSurface, renderExportMotionBlur } from '../motion-blur-surface';
import type { Canvas2DContext } from '../../canvas-types';
const surfaces: Surface[] = [];
let hasContext = true;
let missingContext = -1;
class Surface {
  readonly index = surfaces.length;
  width: number;
  height: number;
  readonly weights: number[] = [];
  readonly context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    drawImage: vi.fn(() => this.weights.push(this.context.globalAlpha)),
  };
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    surfaces.push(this);
  }
  getContext() {
    return hasContext && this.index !== missingContext ? this.context : null;
  }
}
beforeEach(() => {
  disposeExportMotionBlurSurface();
  surfaces.length = 0;
  hasContext = true;
  missingContext = -1;
  vi.stubGlobal('OffscreenCanvas', Surface);
});
afterEach(() => {
  disposeExportMotionBlurSurface();
  vi.unstubAllGlobals();
});
const sample = (weight: number) => ({ camera: { focusX: 0.5, focusY: 0.5, scale: 1 }, weight });
const target = () =>
  ({ drawImage: vi.fn(), globalAlpha: 0.6, globalCompositeOperation: 'multiply' }) as unknown as Canvas2DContext;

it('weights premultiplied samples additively on an isolated exposure and publishes once', () => {
  const output = target(),
    draw = vi.fn();
  renderExportMotionBlur(output, 640, 360, [sample(0.25), sample(0.5), sample(0.25)], draw);
  expect(surfaces).toHaveLength(2);
  expect(draw).toHaveBeenCalledTimes(3);
  expect(surfaces[1]!.context.globalCompositeOperation).toBe('lighter');
  expect(surfaces[1]!.weights).toEqual([0.25, 0.5, 0.25]);
  expect(output.drawImage).toHaveBeenCalledExactlyOnceWith(surfaces[1], 0, 0);
  expect(output.globalAlpha).toBe(0.6);
  expect(output.globalCompositeOperation).toBe('multiply');
});
it('reuses bounded frame surfaces, clears the previous exposure and resizes both together', () => {
  const output = target();
  renderExportMotionBlur(output, 640, 360, [sample(1)], vi.fn());
  renderExportMotionBlur(output, 320, 200, [sample(1)], vi.fn());
  expect(surfaces).toHaveLength(2);
  for (const surface of surfaces) {
    expect(surface).toMatchObject({ width: 320, height: 200 });
    expect(surface.context.clearRect).toHaveBeenLastCalledWith(0, 0, 320, 200);
  }
  disposeExportMotionBlurSurface();
  expect(surfaces.every((surface) => surface.width === 0 && surface.height === 0)).toBe(true);
  renderExportMotionBlur(output, 100, 100, [sample(1)], vi.fn());
  expect(surfaces).toHaveLength(4);
});
it('restores a failed sample and publishes nothing until a complete retry', () => {
  const output = target();
  expect(() =>
    renderExportMotionBlur(output, 100, 100, [sample(1)], () => {
      throw new Error('Source failure');
    }),
  ).toThrow('Source failure');
  expect(surfaces[0]!.context.restore).toHaveBeenCalledOnce();
  expect(output.drawImage).not.toHaveBeenCalled();
  renderExportMotionBlur(output, 100, 100, [sample(1)], vi.fn());
  expect(output.drawImage).toHaveBeenCalledOnce();
});
it('rejects empty shutters without allocating any scene surfaces', () => {
  expect(() => renderExportMotionBlur(target(), 100, 100, [], vi.fn())).toThrow(RangeError);
  expect(surfaces).toHaveLength(0);
});
it('fails explicitly when a sample or accumulation context cannot be allocated', () => {
  hasContext = false;
  expect(() => renderExportMotionBlur(target(), 100, 100, [sample(1)], vi.fn())).toThrow(
    'Motion blur canvas context unavailable',
  );
  hasContext = true;
  vi.stubGlobal('OffscreenCanvas', undefined);
  disposeExportMotionBlurSurface();
  expect(() => renderExportMotionBlur(target(), 100, 100, [sample(1)], vi.fn())).toThrow('OffscreenCanvas is required');
});

it.each([0, 1])('does not publish a partial exposure if canvas context %s is missing', (index) => {
  missingContext = index;
  const output = target();
  expect(() => renderExportMotionBlur(output, 100, 100, [sample(1)], vi.fn())).toThrow(
    'Motion blur canvas context unavailable',
  );
  expect(output.drawImage).not.toHaveBeenCalled();
});
