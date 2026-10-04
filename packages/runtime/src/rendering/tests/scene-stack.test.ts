import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { drawSceneStack, disposeSceneStack } from '../scene-stack';
import { context } from './render.test-support';
import { colorClip, group } from '../../../../engine/src/scene/tests/scene-fixtures';
import type { SceneGraph } from '@beam/engine/scene/scene-types';

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
