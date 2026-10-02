import { describe, expect, it, vi } from 'vitest';
import { gpuShapePlan } from '@beam/runtime/composition/shape/gpu-shape-plan';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { shape, context } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
describe('pixel equivalent GPU shape plans', () => {
  it('treats normalized binary round-off as a pixel edge without admitting real fractional geometry', () => {
    const plan = gpuShapePlan(
      context(),
      shape({ transform: { x: 186 / 1920, y: 132 / 1080, width: 48 / 1920, height: 32 / 1080 } }),
      viewport,
    );
    expect(plan?.[0]).toMatchObject({ rect: { x: 182, y: 128, width: 56, height: 8 } });
  });
  it('creates four non-overlapping opaque outline strips and reuses immutable plans', () => {
    const ctx = context(),
      clip = shape(),
      plan = gpuShapePlan(ctx, clip, viewport);
    expect(plan).toHaveLength(4);
    expect(plan?.[0]).toMatchObject({
      kind: 'solid',
      rect: { x: 572, y: 320, width: 776, height: 8 },
      color: [1, 90 / 255, 31 / 255, 1],
    });
    expect(gpuShapePlan(ctx, clip, viewport)).toBe(plan);
    expect(gpuShapePlan(ctx, clip, viewport, { ...clip.transform, x: 600 / 1920 })).not.toBe(plan);
  });
  it('supports opaque fills, fill plus border and a genuinely empty rectangular layer', () => {
    expect(gpuShapePlan(context(), shape({ fillEnabled: true, fillColor: '#123456ff' }), viewport)).toHaveLength(5);
    expect(
      gpuShapePlan(
        context(),
        shape({
          fillEnabled: true,
          borderWidth: 0,
          opacityEnabled: true,
          opacity: 100,
          backdropBlur: 0,
        }),
        viewport,
      ),
    ).toHaveLength(1);
    expect(gpuShapePlan(context(), shape({ fillEnabled: false, borderWidth: 0 }), viewport)).toEqual([]);
  });
  it.each([
    { globalAlpha: 0.5 },
    { globalCompositeOperation: 'multiply' },
    { filter: 'blur(1px)' },
    { shadowBlur: 2 },
    { shadowOffsetX: 1 },
    { shadowOffsetY: 1 },
  ])('keeps inherited canvas state %j native', (patch) => {
    expect(gpuShapePlan(Object.assign(context(), patch), shape(), viewport)).toBeNull();
  });
  it.each([{ b: 0.1 }, { c: 0.1 }, { a: 0 }, { a: -1 }, { d: 2 }])('keeps unsupported transform %j native', (patch) => {
    const ctx = context();
    vi.mocked(ctx.getTransform).mockReturnValue({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      ...patch,
    } as DOMMatrix);
    expect(gpuShapePlan(ctx, shape(), viewport)).toBeNull();
  });
  it.each([
    { preset: 'ellipse' },
    { rotation: 15 },
    { family: 'arrow' },
    { family: 'text' },
    { family: 'drawing' },
    { shadowEnabled: true },
    { opacityEnabled: true },
    { opacityEnabled: true, opacity: 100, backdropBlur: 10 },
    { fillColor: '#12345680' },
    { fillColor: '#00000000' },
    { borderColor: '#ffffff80' },
    { text: { content: 'Caption' } },
    {
      fill: {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 0,
          stops: [
            { id: 'a', position: 0, color: '#ff0000', alpha: 1 },
            { id: 'b', position: 1, color: '#0000ff', alpha: 1 },
          ],
        },
      },
    },
    {
      transitions: {
        entry: { preset: { kind: 'fade' }, durationMs: 100 },
        exit: null,
      },
    },
    {
      transitions: {
        entry: null,
        exit: { preset: { kind: 'fade' }, durationMs: 100 },
      },
    },
  ])('keeps appearance %j in the native painter', (patch) => {
    expect(gpuShapePlan(context(), shape(patch as Partial<ShapeClip>), viewport)).toBeNull();
  });
  it('rejects fractional edges, clipping boundaries, oversized strokes and empty geometry', () => {
    for (const transform of [
      { x: 0, y: 0.3, width: 0.4, height: 0.3 },
      { x: 0.3, y: 0, width: 0.4, height: 0.3 },
      { x: 0.8, y: 0.3, width: 0.4, height: 0.3 },
      { x: 0.3, y: 0.8, width: 0.4, height: 0.3 },
      { x: 0.3001, y: 0.3, width: 0.4, height: 0.3 },
      { x: 0.3, y: 0.3, width: 0, height: 0.3 },
      { x: 0.3, y: 0.3, width: 0.01, height: 0.01 },
    ])
      expect(gpuShapePlan(context(), shape({ borderWidth: 40, transform }), viewport)).toBeNull();
  });
});
