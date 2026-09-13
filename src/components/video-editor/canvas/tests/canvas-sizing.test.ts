import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewQuality } from '~/media/playback/playback-preview';
import { resizeEditorCanvas } from '../canvas-sizing';

const canvas = (width = 0, height = 0) => ({ width, height }) as HTMLCanvasElement;
const container = (clientWidth: number, clientHeight: number) => ({ clientWidth, clientHeight }) as HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resizeEditorCanvas', () => {
  it('returns null when either DOM element is unavailable', () => {
    const target = canvas(320, 180);
    expect(resizeEditorCanvas(null, container(800, 450), 'full')).toBeNull();
    expect(resizeEditorCanvas(target, null, 'full')).toBeNull();
    expect(target).toMatchObject({ width: 320, height: 180 });
  });

  it('uses capped device pixel ratio, rounds backing dimensions, and reports the logical size', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2.5 });
    const target = canvas();

    const size = resizeEditorCanvas(target, container(801, 451), 'full');

    expect(size).toEqual({ width: 801, height: 451, scale: 2 });
    expect(target.width).toBe(1_602);
    expect(target.height).toBe(902);
  });

  it.each([
    ['full', 1],
    ['half', 0.5],
    ['quarter', 0.25],
  ] as const)('scales the canvas backing store at %s preview quality', (quality, factor) => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const target = canvas();

    const size = resizeEditorCanvas(target, container(800, 450), quality);

    expect(size).toEqual({ width: 800, height: 450, scale: 2 * factor });
    expect(target.width).toBe(Math.round(800 * 2 * factor));
    expect(target.height).toBe(Math.round(450 * 2 * factor));
  });

  it('falls back to a one-pixel ratio when devicePixelRatio is zero and clamps empty sizes', () => {
    vi.stubGlobal('window', { devicePixelRatio: 0 });
    const target = canvas();

    const size = resizeEditorCanvas(target, container(0, 0), 'full');

    expect(size).toEqual({ width: 1, height: 1, scale: 1 });
    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });

  it('rejects a quality value outside the preview presets', () => {
    const target = canvas();

    expect(() => resizeEditorCanvas(target, container(800, 450), 'invalid' as PreviewQuality)).toThrow(
      'The playback preview quality is invalid.',
    );
  });
});
