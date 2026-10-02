import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintTimelineCanvas, timelineCanvasSpan } from '../timeline-canvas-paint';
import type { TimelineCanvasPalette, TimelineCanvasArtwork } from '../timeline-canvas-types';
import type { Clip } from '@beam/engine/shared/composition-types';
import { visual, importedAudio, keyboardCaption, zoom } from './TimelineTracks.test-support';

const helpers = vi.hoisted(() => ({ artwork: vi.fn(), transition: vi.fn() }));
vi.mock('../timeline-canvas-artwork', () => ({ paintTimelineArtwork: helpers.artwork }));
vi.mock('../timeline-canvas-transition', () => ({ paintTimelineTransition: helpers.transition }));
const palette: TimelineCanvasPalette = {
  background: '#000',
  text: '#fff',
  border: '#777',
  selected: '#0ff',
  video: '#00f',
  annotation: '#f0f',
  blur: '#f00',
  highlight: '#fa0',
  audio: '#0f0',
  zoom: '#ff0',
  labelBackground: '#123',
  labelText: '#abc',
  curve: '#ccc',
  radius: 6,
  tint: 0.36,
  disabledOpacity: 0.3,
  effectInset: 6,
  effectHeight: 36,
};
const geometry = { durationMs: 60000, width: 6000, left: 1000, viewportWidth: 1000, height: 32 };
function context() {
  const fills: { style: unknown; alpha: number }[] = [];
  const ctx = {
    canvas: { width: 3000, height: 96 },
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn(() => ({ width: 42 })),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fill: vi.fn(() => fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha })),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}
afterEach(() => vi.clearAllMocks());

describe('viewport-only canvas timeline geometry', () => {
  it('uses viewport-local layout pixels and the same minimum hit width as semantic buttons', () => {
    expect(timelineCanvasSpan(10000, 1000, 60000, 6000, 1000)).toEqual({ x: 0, width: 100 });
    expect(timelineCanvasSpan(5000, 1, 60000, 6000, 1000)).toEqual({ x: -500, width: 14 });
    expect(timelineCanvasSpan(0, 0, 1, 1, 0)).toEqual({ x: 0, width: 14 });
  });
  it.each([
    [0, 1, 0],
    [1, 0, 0],
    [1, 1, NaN],
    [NaN, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
  ])('rejects invalid duration/width/offset', (duration, width, left) =>
    expect(() => timelineCanvasSpan(0, 1, duration, width, left)).toThrow('geometry'),
  );
  it('rejects nonfinite clip start/duration independently of viewport geometry', () => {
    expect(() => timelineCanvasSpan(NaN, 1, 60000, 6000, 0)).toThrow(RangeError);
    expect(() => timelineCanvasSpan(0, Infinity, 60000, 6000, 0)).toThrow(RangeError);
    expect(timelineCanvasSpan(10000, 1000, 60000, 6000, -20)).toEqual({ x: 1020, width: 100 });
  });
});

describe('canvas timeline painter', () => {
  it('draws and clips visible items, culls both offscreen sides and uses theme radius/selection', () => {
    const { ctx } = context();
    paintTimelineCanvas(
      ctx,
      [
        { clip: visual({ timelineStartMs: 10000, timelineDurationMs: 1000 }), selected: true },
        { clip: visual({ timelineStartMs: 40000 }), selected: false },
        { clip: visual({ timelineStartMs: 0, timelineDurationMs: 1000 }), selected: false },
      ],
      geometry,
      palette,
    );
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1000, 32);
    expect(ctx.roundRect).toHaveBeenCalledTimes(2);
    expect(ctx.roundRect).toHaveBeenCalledWith(0, 2, 100, 28, 6);
    expect(ctx.fillText).toHaveBeenCalledWith('Screen capture', 8, 16);
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe('#0ff');
    expect(ctx.rect).toHaveBeenCalledWith(8, 2, 84, 28);
    expect(helpers.artwork).not.toHaveBeenCalled();
  });
  it('uses audio/zoom/highlight track colors and honors single disabled opacity with theme tint', () => {
    const { ctx, fills } = context();
    const highlight = {
      ...visual({ timelineStartMs: 10000, timelineDurationMs: 1000, enabled: false }),
      kind: 'blur',
      mode: 'highlight',
    } as unknown as Clip;
    paintTimelineCanvas(
      ctx,
      [
        { clip: importedAudio({ timelineStartMs: 10000, timelineDurationMs: 1000 }), selected: false },
        { zoom: zoom({ startMs: 12000, endMs: 13000 }), label: 'Zoom 1.5×', selected: false },
        { clip: highlight, selected: false },
      ],
      geometry,
      palette,
    );
    expect(fills.filter((_fill, index) => index % 2 === 1).map((fill) => fill.style)).toEqual(['#0f0', '#ff0', '#fa0']);
    expect(fills[4]!.alpha).toBe(0.3);
    expect(fills[5]!.alpha).toBeCloseTo(0.3 * 0.36);
    expect(ctx.fillText).toHaveBeenCalledWith('Zoom 1.5×', 208, 24);
  });
  it('preserves shape text, explicit labels, blur tint and an empty viewport', () => {
    const { ctx, fills } = context();
    const shape = {
      ...visual({ timelineStartMs: 10000, timelineDurationMs: 1000 }),
      kind: 'shape',
      text: { content: '  Text  ' },
    } as unknown as Clip;
    const blur = { ...visual({ timelineStartMs: 12000, timelineDurationMs: 1000 }), kind: 'blur' } as unknown as Clip;
    paintTimelineCanvas(
      ctx,
      [
        { clip: shape, selected: false },
        { clip: blur, label: 'Explicit', selected: false },
      ],
      geometry,
      palette,
    );
    expect(ctx.fillText).toHaveBeenCalledWith('Text', 8, 16);
    expect(ctx.fillText).toHaveBeenCalledWith('Explicit', 223, 16);
    expect(fills[1]!.style).toBe(palette.annotation);
    expect(fills[3]!.style).toBe(palette.blur);
    paintTimelineCanvas(ctx, [], geometry, palette);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
  });
  it('forwards ready artwork with its original clip duration and protects labels in the media overlay', () => {
    const { ctx } = context(),
      artwork: TimelineCanvasArtwork = { kind: 'thumbnails', frames: [] };
    const clip = visual({ id: 'video', timelineStartMs: 10000, timelineDurationMs: 1000 });
    paintTimelineCanvas(ctx, [{ clip, selected: false }], geometry, palette, new Map([['video', artwork]]));
    expect(helpers.artwork).toHaveBeenCalledWith(
      ctx,
      artwork,
      { x: 0, y: 2, width: 100, height: 28 },
      1000,
      palette,
      1000,
    );
    expect(ctx.fillRect).toHaveBeenCalledWith(5, 3, 50, 13);
    expect(ctx.fillText).toHaveBeenCalledWith('Screen capture', 8, 9);
    expect(ctx.fillStyle).toBe(palette.labelText);
  });
  it('preserves entry/exit duration and ordering, and draws the selected border after artwork/transitions', () => {
    const { ctx } = context();
    const entry = { preset: { kind: 'fade' as const }, durationMs: 200 },
      exit = { preset: { kind: 'blur' as const }, durationMs: 300 };
    const clip = visual({ timelineStartMs: 10000, timelineDurationMs: 1000, transitions: { entry, exit } });
    paintTimelineCanvas(ctx, [{ clip, selected: true }], geometry, palette);
    expect(helpers.transition.mock.calls.map((call) => call.slice(1, 4))).toEqual([
      ['entry', entry, { x: 0, width: 20, height: 32 }],
      ['exit', exit, { x: 70, width: 30, height: 32 }],
    ]);
    expect(vi.mocked(ctx.stroke).mock.invocationCallOrder[0]).toBeGreaterThan(
      helpers.transition.mock.invocationCallOrder[1]!,
    );
  });
  it('paints whole-canvas entry/exit items at the actual document boundaries', () => {
    const { ctx, fills } = context(),
      transition = { preset: { kind: 'fade' as const }, durationMs: 1000 };
    paintTimelineCanvas(
      ctx,
      [
        { transition, edge: 'entry', label: 'Entry', selected: false },
        { transition, edge: 'exit', label: 'Exit', selected: false },
      ],
      { ...geometry, left: 0, viewportWidth: 6000 },
      palette,
    );
    expect(helpers.transition.mock.calls.map((call) => call[3])).toEqual([
      { x: 0, width: 100, height: 32 },
      { x: 5900, width: 100, height: 32 },
    ]);
    expect(fills.filter((_fill, index) => index % 2 === 1).map((fill) => fill.style)).toEqual([
      palette.curve,
      palette.curve,
    ]);
    expect(vi.mocked(ctx.roundRect).mock.calls).toEqual([
      [0, 3, 100, 26, 6],
      [0, 3, 100, 26, 6],
      [5900, 3, 100, 26, 6],
      [5900, 3, 100, 26, 6],
    ]);
  });
  it('keeps locked hatching bounded, offsets labels for icons and paints paste feedback without thickening selection', () => {
    const { ctx } = context(),
      clip = visual({ id: 'locked', timelineStartMs: 10000, timelineDurationMs: 1000, locked: true });
    paintTimelineCanvas(
      ctx,
      [{ clip, labelInset: 30, pasteHighlight: true, selected: false }],
      geometry,
      palette,
      undefined,
      { id: 'locked', offset: 20 },
    );
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('Screen capture', 18, 16);
    expect(ctx.strokeStyle).toBe(palette.selected);
    expect(ctx.lineWidth).toBe(1);
    expect(ctx.rect).toHaveBeenCalledWith(38, 2, 54, 28);
  });
  it('does not apply another item’s hover offset or draw an offscreen artwork', () => {
    const { ctx } = context(),
      clip = visual({ id: 'current', timelineStartMs: 10000, timelineDurationMs: 1000 });
    paintTimelineCanvas(ctx, [{ clip, selected: false }], geometry, palette, undefined, { id: 'other', offset: 50 });
    expect(ctx.fillText).toHaveBeenCalledWith('Screen capture', 8, 16);
  });
  it('does not fabricate a title for a genuinely blank element label', () => {
    const { ctx } = context();
    const clip = {
      ...visual({ timelineStartMs: 10000, timelineDurationMs: 1000, name: '' }),
      kind: 'shape',
      text: { content: '  ' },
    } as unknown as Clip;
    paintTimelineCanvas(ctx, [{ clip, selected: false }], geometry, palette);
    expect(ctx.fillText).toHaveBeenCalledWith('', 8, 16);
  });

  it('keeps a partly offscreen title attached to its clip rather than pinning it ahead of DOM icons', () => {
    const { ctx } = context();
    const clip = visual({ id: 'partially-visible', timelineStartMs: 9000, timelineDurationMs: 4000, locked: true });
    paintTimelineCanvas(ctx, [{ clip, labelInset: 30, selected: false }], geometry, palette);
    expect(ctx.roundRect).toHaveBeenCalledWith(-100, 2, 400, 28, palette.radius);
    expect(ctx.fillText).toHaveBeenCalledWith('Screen capture', -62, 16);
    expect(vi.mocked(ctx.fillText).mock.calls[0]?.[1]).not.toBe(8);
  });

  it.each(['zoom', 'caption'] as const)(
    'matches the %s semantic handle inset/height for body, title clipping and selected border',
    (kind) => {
      const { ctx } = context();
      const item =
        kind === 'zoom'
          ? { zoom: zoom({ startMs: 10000, endMs: 11000 }), label: 'Effect title', selected: true }
          : { clip: { ...keyboardCaption(), timelineStartMs: 10000 }, label: 'Effect title', selected: true };
      paintTimelineCanvas(ctx, [item], { ...geometry, height: 48 }, palette);
      expect(vi.mocked(ctx.roundRect).mock.calls).toEqual([
        [0, 6, 100, 36, 6],
        [0, 6, 100, 36, 6],
      ]);
      expect(ctx.rect).toHaveBeenCalledWith(8, 6, 84, 36);
      expect(ctx.fillText).toHaveBeenCalledWith('Effect title', 8, 24);
      expect(ctx.strokeStyle).toBe(palette.selected);
      expect(ctx.lineWidth).toBe(2);
    },
  );

  it('uses effect geometry from the active theme rather than hardcoded values or the full row height', () => {
    const { ctx } = context();
    paintTimelineCanvas(
      ctx,
      [{ zoom: zoom({ startMs: 10000, endMs: 11000 }), label: 'Themed zoom', selected: false }],
      { ...geometry, height: 64 },
      { ...palette, effectInset: 4, effectHeight: 28 },
    );
    expect(vi.mocked(ctx.roundRect).mock.calls).toEqual([
      [0, 4, 100, 28, 6],
      [0, 4, 100, 28, 6],
    ]);
    expect(ctx.rect).toHaveBeenCalledWith(8, 4, 84, 28);
    expect(ctx.fillText).toHaveBeenCalledWith('Themed zoom', 8, 18);
  });
});
