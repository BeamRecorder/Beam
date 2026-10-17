import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { drawSceneStack, disposeSceneStack } from '../scene-stack';
import { context } from './render.test-support';
import { colorClip, group } from '../../../../engine/src/scene/tests/scene-fixtures';
import type { SceneGraph } from '@beam/engine/scene/scene-types';
import { createSceneGraphIndex } from '@beam/engine/scene/scene-graph-index';

let available: boolean;
const buffers: Array<{ width: number; height: number; context: CanvasRenderingContext2D }> = [];
const ctx = () =>
  Object.assign(context(), {
    canvas: { width: 100, height: 50 },
    rotate: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    resetTransform: vi.fn(),
  });
beforeEach(() => {
  available = true;
  buffers.length = 0;
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      context = ctx();
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        buffers.push(this);
      }
      getContext() {
        return available ? this.context : null;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
const graph = (): SceneGraph => ({ version: 1, roots: ['g'], groups: [group()] });
const bounds = { width: 100, height: 50 };
it('draws indexed nested groups in the same order and geometry as direct graph input', () => {
  const inner = group('inner', ['a']);
  const outer = group('outer', ['inner', 'b']);
  inner.transform.rotation = 23;
  outer.transform.x = 0.2;
  const value: SceneGraph = { version: 1, roots: ['outer'], groups: [inner, outer] };
  const clips = [colorClip(), colorClip('b'), colorClip('free')];
  const direct = ctx(),
    indexed = ctx();
  const directPaint = vi.fn(),
    indexedPaint = vi.fn();
  drawSceneStack(direct, clips, value, bounds, directPaint);
  drawSceneStack(indexed, clips, createSceneGraphIndex(value), bounds, indexedPaint);
  expect(indexedPaint.mock.calls.map((call) => call[1].map((clip: { id: string }) => clip.id))).toEqual(
    directPaint.mock.calls.map((call) => call[1].map((clip: { id: string }) => clip.id)),
  );
  for (const method of ['translate', 'rotate', 'scale', 'save', 'restore'] as const)
    expect(vi.mocked(indexed[method]).mock.calls).toEqual(vi.mocked(direct[method]).mock.calls);
});

it('does not reread inactive group memberships during indexed shutter samples', () => {
  const groups = Array.from({ length: 1000 }, (_, i) => group(`g-${i}`, [`clip-${i}`]));
  const value: SceneGraph = { version: 1, roots: groups.map((entry) => entry.id), groups };
  const index = createSceneGraphIndex(value);
  const read = vi.fn();
  for (const entry of groups.slice(1))
    Object.defineProperty(entry, 'children', {
      get() {
        read();
        return [];
      },
    });
  const paint = vi.fn(),
    context = ctx();
  for (let sample = 0; sample < 5; sample++) drawSceneStack(context, [colorClip('clip-0')], index, bounds, paint);
  expect(read).not.toHaveBeenCalled();
  expect(paint).toHaveBeenCalledTimes(5);
});

it('uses current animated group values with shared membership and isolates alpha', () => {
  const value = graph();
  const index = createSceneGraphIndex(value);
  const animated = { ...value.groups[0]!, opacity: 0.4, transform: { ...value.groups[0]!.transform, x: 0.3 } };
  const context = ctx();
  drawSceneStack(context, [colorClip()], { ...index, groups: new Map([['g', animated]]) }, bounds, vi.fn());
  expect(context.translate).toHaveBeenCalledWith(80, 25);
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(context.globalAlpha).toBe(0.4);
  disposeSceneStack(context);
});
it('preserves bulk drawing and its order for flat compositions', () => {
  const paint = vi.fn(),
    clips = [colorClip(), colorClip('b')],
    context = ctx();
  drawSceneStack(context, clips, undefined, bounds, paint);
  expect(paint).toHaveBeenCalledWith(context, clips);
  disposeSceneStack(context);
});
it('visits nested groups in authored paint order, including undeclared root clips', () => {
  const value = graph();
  value.roots = ['outer'];
  value.groups.push(group('outer', ['g']));
  const paint = vi.fn(),
    context = ctx();
  drawSceneStack(context, [colorClip(), colorClip('b')], value, { ...bounds, x: 4, y: 5 }, paint);
  expect(paint.mock.calls.map((call) => call[1][0].id)).toEqual(['a', 'b']);
  expect(context.translate).toHaveBeenCalledWith(54, 30);
  expect(context.save).toHaveBeenCalledTimes(4);
  expect(context.restore).toHaveBeenCalledTimes(4);
});
it('skips empty and transparent groups and missing root nodes', () => {
  const value = graph(),
    paint = vi.fn();
  value.roots.push('absent');
  drawSceneStack(ctx(), [], value, bounds, paint);
  value.groups[0]!.opacity = 0;
  drawSceneStack(ctx(), [colorClip()], value, bounds, paint);
  expect(paint).not.toHaveBeenCalled();
});
it.each(['rectangle', 'ellipse'] as const)('clips %s masks and applies isolated opacity once', (shape) => {
  const value = graph();
  value.groups[0]!.opacity = 0.5;
  value.groups[0]!.mask = { shape, x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
  const context = ctx(),
    paint = vi.fn();
  drawSceneStack(context, [colorClip()], value, bounds, paint);
  expect(buffers).toHaveLength(1);
  expect(buffers[0]!.context.clip).toHaveBeenCalledOnce();
  expect(context.drawImage).toHaveBeenCalledWith(buffers[0], 0, 0);
  drawSceneStack(context, [colorClip()], value, bounds, paint);
  expect(buffers).toHaveLength(1);
  context.canvas.width = 200;
  context.canvas.height = 80;
  drawSceneStack(context, [colorClip()], value, bounds, paint);
  expect(buffers[0]).toMatchObject({ width: 200, height: 80 });
  disposeSceneStack(context);
  expect(buffers[0]).toMatchObject({ width: 0, height: 0 });
});
it('isolates blending and releases buffers for removed groups', () => {
  const value = graph();
  value.groups[0]!.blendMode = 'multiply';
  const context = ctx();
  drawSceneStack(context, [colorClip()], value, bounds, vi.fn());
  drawSceneStack(context, [colorClip()], { version: 1, roots: ['a'], groups: [] }, bounds, vi.fn());
  expect(buffers[0]).toMatchObject({ width: 0, height: 0 });
});
it('bounds scratch surfaces by isolation depth instead of sibling group count', () => {
  const value = graph();
  value.groups[0]!.opacity = 0.5;
  value.groups.push({ ...group('sibling', ['b']), opacity: 0.5 });
  value.roots.push('sibling');
  drawSceneStack(ctx(), [colorClip(), colorClip('b')], value, bounds, vi.fn());
  expect(buffers).toHaveLength(1);
  value.groups.push({ ...group('outer', ['g', 'sibling']), opacity: 0.5 });
  value.roots = ['outer'];
  const context = ctx();
  drawSceneStack(context, [colorClip(), colorClip('b')], value, bounds, vi.fn());
  expect(buffers).toHaveLength(3); // One previous scope, plus two simultaneous isolations.
  disposeSceneStack(context);
});
it('restores every saved state when a child fails', () => {
  const context = ctx();
  expect(() =>
    drawSceneStack(context, [colorClip()], graph(), bounds, () => {
      throw new Error('paint failed');
    }),
  ).toThrow('paint failed');
  expect(context.save).toHaveBeenCalledTimes(2);
  expect(context.restore).toHaveBeenCalledTimes(2);
});
it('reports unavailable group surfaces and still restores the parent', () => {
  available = false;
  const value = graph();
  value.groups[0]!.opacity = 0.5;
  const context = ctx();
  expect(() => drawSceneStack(context, [colorClip()], value, bounds, vi.fn())).toThrow('canvas is unavailable');
  expect(context.restore).toHaveBeenCalledOnce();
});
