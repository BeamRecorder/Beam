import { describe, expect, it, vi } from 'vitest';
import { paintTimelineTransition } from '@beam/runtime/timeline/timeline-canvas-transition';
import type { TimelineCanvasPalette } from '@beam/runtime/timeline/timeline-canvas-types';
import { MAX_TRANSITION_EASING_POWER, MIN_TRANSITION_EASING_POWER } from '@beam/engine/shared/clip-transitions';

const palette: TimelineCanvasPalette = {
  background: '#000',
  text: '#fff',
  itemText: '#def',
  border: '#777',
  selected: '#0ff',
  video: '#00f',
  image: '#a50',
  shape: '#a30',
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
};
const rect = { x: 10, width: 100, height: 32 };
function context() {
  const saved: {
      globalAlpha: number;
      strokeStyle: string;
      lineWidth: number;
    }[] = [],
    strokes: { color: string; width: number; alpha: number }[] = [];
  const ctx = {
    canvas: { width: 1000 },
    globalAlpha: 0.5,
    strokeStyle: '#original',
    lineWidth: 4,
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(() =>
      saved.push({
        globalAlpha: ctx.globalAlpha,
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
      }),
    ),
    restore: vi.fn(() => Object.assign(ctx, saved.pop()!)),
    stroke: vi.fn(() =>
      strokes.push({
        color: ctx.strokeStyle,
        width: ctx.lineWidth,
        alpha: ctx.globalAlpha,
      }),
    ),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
}
const draw = (edge: 'entry' | 'exit', easingPower?: number) => {
  const state = context();
  paintTimelineTransition(state.ctx, edge, { preset: { kind: 'fade' }, durationMs: 200, easingPower }, rect, palette);
  return state;
};

describe('canvas transition curves', () => {
  it('draws opposite entry/exit progress endpoints inside the transition rectangle', () => {
    const entry = draw('entry', 1),
      exit = draw('exit', 1);
    expect(entry.ctx.rect).toHaveBeenCalledWith(10, 2, 100, 28);
    expect(entry.ctx.moveTo).toHaveBeenLastCalledWith(12, 28);
    expect(entry.ctx.lineTo).toHaveBeenLastCalledWith(108, 4);
    expect(exit.ctx.moveTo).toHaveBeenLastCalledWith(12, 4);
    expect(exit.ctx.lineTo).toHaveBeenLastCalledWith(108, 28);
  });
  it('uses actual saved easing power and clamps it at the same domain boundaries', () => {
    const low = draw('entry', -100),
      minimum = draw('entry', MIN_TRANSITION_EASING_POWER),
      high = draw('entry', 100),
      maximum = draw('entry', MAX_TRANSITION_EASING_POWER);
    expect(vi.mocked(low.ctx.lineTo).mock.calls).toEqual(vi.mocked(minimum.ctx.lineTo).mock.calls);
    expect(vi.mocked(high.ctx.lineTo).mock.calls).toEqual(vi.mocked(maximum.ctx.lineTo).mock.calls);
    expect(vi.mocked(draw('entry', 1).ctx.lineTo).mock.calls).not.toEqual(
      vi.mocked(draw('entry', 5).ctx.lineTo).mock.calls,
    );
  });
  it('draws hatch and contrast strokes with theme colors and restores all inherited state', () => {
    const { ctx, strokes } = draw('exit');
    expect(strokes[0]).toEqual({
      color: '#ccc',
      width: 0.7,
      alpha: 0.5 * 0.38,
    });
    expect(strokes.at(-2)).toEqual({ color: '#000', width: 2.75, alpha: 0.5 });
    expect(strokes.at(-1)).toEqual({
      color: '#ccc',
      width: 1.25,
      alpha: 0.5 * 0.82,
    });
    expect(ctx.globalAlpha).toBe(0.5);
    expect(ctx.strokeStyle).toBe('#original');
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.save).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });
  it('does no work for nonpositive transition width and keeps hatch work bounded offscreen', () => {
    const { ctx } = context();
    for (const width of [0, -1])
      paintTimelineTransition(ctx, 'entry', { preset: { kind: 'fade' }, durationMs: 200 }, { ...rect, width }, palette);
    expect(ctx.beginPath).not.toHaveBeenCalled();
    paintTimelineTransition(
      ctx,
      'entry',
      { preset: { kind: 'fade' }, durationMs: 200 },
      { x: -100000, width: 200000, height: 32 },
      palette,
    );
    expect(vi.mocked(ctx.stroke).mock.calls.length).toBeLessThan(200);
  });
  it('supports narrow transitions and tiny lanes without negative curve spans', () => {
    const { ctx } = context();
    paintTimelineTransition(
      ctx,
      'entry',
      { preset: { kind: 'fade' }, durationMs: 1 },
      { x: 10, width: 2, height: 4 },
      palette,
    );
    expect(ctx.moveTo).toHaveBeenLastCalledWith(12, 5);
    expect(ctx.lineTo).toHaveBeenLastCalledWith(12, 4);
    expect(vi.mocked(ctx.lineTo).mock.calls.every((call) => call.every(Number.isFinite))).toBe(true);
  });
});
