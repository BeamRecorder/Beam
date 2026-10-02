import { afterEach, describe, expect, it, vi } from 'vitest';
import { GpuSceneRenderer } from '../gpu-scene-renderer';
import { EngineMetrics } from '../../performance/engine-metrics';
import type { GpuSceneCommand } from '../gpu-scene-types';
import { gpuFilterFixture as gpuFixture } from './gpu-filter.test-support';

const rect = { x: 0, y: 0, width: 20, height: 10 };
const solid = (patch: Partial<Extract<GpuSceneCommand, { kind: 'solid' }>> = {}): GpuSceneCommand => ({
  kind: 'solid',
  rect,
  color: [1, 0, 0, 1],
  ...patch,
});
const image = (patch: Partial<Extract<GpuSceneCommand, { kind: 'image' }>> = {}): GpuSceneCommand => ({
  kind: 'image',
  source: {} as TexImageSource,
  width: 20,
  height: 10,
  rect,
  immutable: true,
  ...patch,
});
afterEach(() => vi.unstubAllGlobals());
describe('ordered GPU scenes', () => {
  it('enforces retained-target memory budgets before allocation and reports released memory', () => {
    for (const budget of [0, NaN, 3, 4.5]) {
      expect(() => new GpuSceneRenderer({ canvas: gpuFixture().canvas, maxRenderTargetBytes: budget })).toThrow(
        'budget',
      );
    }
    const { canvas } = gpuFixture(),
      renderer = new GpuSceneRenderer({ canvas, maxRenderTargetBytes: 120 });
    expect(() => renderer.render([], 10, 10)).toThrow('dimensions');
    renderer.render([], 2, 2);
    renderer.dispose();
    expect(renderer.stats().renderTargetBytes).toBe(0);
  });
  it('accepts the exact four-byte minimum for a one-pixel destination', () => {
    const { gl, canvas } = gpuFixture();
    const renderer = new GpuSceneRenderer({ canvas, maxRenderTargetBytes: 4 });
    renderer.render([], 1, 1);
    expect(renderer.stats().renderTargetBytes).toBe(4);
    expect(gl.createTexture).toHaveBeenCalledTimes(4);
    expect(() => renderer.render([], 2, 1)).toThrow('dimensions');
    renderer.dispose();
  });
  it('owns one destination, reuses it and releases every created texture across resize and disposal', () => {
    const { gl, canvas } = gpuFixture();
    const renderer = new GpuSceneRenderer({ canvas });
    renderer.render([], 100, 50);
    renderer.render([], 100, 50);
    expect(gl.createTexture).toHaveBeenCalledTimes(4);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(renderer.stats().renderTargetBytes).toBe(100 * 50 * 4);
    renderer.render([], 50, 25);
    expect(gl.createTexture).toHaveBeenCalledTimes(5);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
    expect(renderer.stats().renderTargetBytes).toBe(50 * 25 * 4);
    renderer.dispose();
    const allocated = vi.mocked(gl.createTexture).mock.results.map((result) => result.value);
    const released = vi.mocked(gl.deleteTexture).mock.calls.map(([texture]) => texture);
    expect(released).toHaveLength(5);
    expect(new Set(released)).toEqual(new Set(allocated));
    expect(renderer.stats().renderTargetBytes).toBe(0);
  });
  it('reports retained Gaussian allocations in addition to its single destination and releases both', () => {
    const { gl, canvas } = gpuFixture();
    const renderer = new GpuSceneRenderer({ canvas });
    renderer.render([{ kind: 'blur', rect, radius: 4 }], 100, 50);
    expect(gl.createTexture).toHaveBeenCalledTimes(7);
    expect(renderer.stats().renderTargetBytes).toBe(100 * 50 * 4 + 128 * 78 * 4 * 3);
    renderer.dispose();
    const allocated = vi.mocked(gl.createTexture).mock.results.map((result) => result.value);
    const released = vi.mocked(gl.deleteTexture).mock.calls.map(([texture]) => texture);
    expect(released).toHaveLength(7);
    expect(new Set(released)).toEqual(new Set(allocated));
    expect(renderer.stats().renderTargetBytes).toBe(0);
  });
  it('validates rounded and instanced images, crops, alpha and solid colors consistently', () => {
    const { canvas } = gpuFixture(),
      renderer = new GpuSceneRenderer({ canvas });
    for (const radius of [0, 2]) {
      for (const patch of [
        { opacity: NaN },
        { opacity: -1 },
        { opacity: 2 },
        { crop: { x: -1, y: 0, width: 10, height: 10 } },
        { crop: { x: 0, y: -1, width: 10, height: 10 } },
        { crop: { x: 0, y: 0, width: -1, height: 10 } },
        { crop: { x: 0, y: 0, width: 10, height: -1 } },
        { crop: { x: 10, y: 0, width: 20, height: 10 } },
        { crop: { x: 0, y: 5, width: 10, height: 10 } },
      ])
        expect(() => renderer.render([image({ radius, ...patch })], 50, 25)).toThrow('image');
    }
    expect(() => renderer.render([solid({ radius: 2, color: [NaN, 0, 0, 1] })], 50, 25)).toThrow('color');
    expect(() => renderer.render([solid({ radius: NaN })], 50, 25)).toThrow('radius');
    renderer.render([image({ mirrored: true, mirroredY: true }), image({ radius: 2 })], 50, 25);
    renderer.dispose();
  });
  it('splits media texture banks at capacity and byte limits without evicting active samplers', () => {
    for (const options of [{ maxTextures: 2 }, { maxTextureBytes: 1600 }]) {
      const { canvas, gl } = gpuFixture(),
        renderer = new GpuSceneRenderer({ canvas, ...options });
      renderer.render(
        Array.from({ length: 10 }, () => image()),
        50,
        25,
      );
      expect(gl.drawArraysInstanced).toHaveBeenCalledTimes(5);
      expect(renderer.stats().textures).toBeLessThanOrEqual(2);
      renderer.dispose();
    }
  });
  it('renders 10000 shapes in bounded instanced batches, retaining media across frames', () => {
    const { gl, canvas } = gpuFixture(),
      metrics = new EngineMetrics({ enabled: true }),
      renderer = new GpuSceneRenderer({ canvas, metrics });
    const frame = image(),
      commands = [frame, ...Array.from({ length: 10000 }, () => solid()), frame];
    expect(renderer.render(commands, 1920, 1080)).toBe(canvas);
    renderer.render(commands, 1920, 1080);
    renderer.pollMetrics();
    expect(gl.drawArraysInstanced).toHaveBeenCalledTimes(10);
    expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLE_STRIP, 0, 4, 4096);
    expect(metrics.snapshot().counters.uploads).toBe(1);
    expect(renderer.stats()).toEqual({ textures: 1, bytes: 800, renderTargetBytes: 1920 * 1080 * 4 });
    renderer.dispose();
    renderer.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(canvas.width).toBe(1);
  });
  it('supports crop, mirrors, opacity, rounding and ordered blur without sampling its target', () => {
    const { gl, canvas } = gpuFixture(),
      renderer = new GpuSceneRenderer({ canvas });
    const commands = [
      solid(),
      image({
        crop: { x: 2, y: 1, width: 16, height: 8 },
        mirrored: true,
        mirroredY: true,
        opacity: 0.5,
        radius: 2,
      }),
      solid({ radius: 2 }),
      { kind: 'blur', rect: { x: -10, y: -5, width: 30, height: 20 }, radius: 4 } as const,
      solid(),
    ];
    renderer.render(commands, 100, 50);
    expect(gl.uniform4f).toHaveBeenCalledWith(expect.anything(), 1, 1, 1, 0.5);
    expect(gl.scissor).toHaveBeenCalledWith(0, 35, 20, 15);
    expect(gl.drawArrays).toHaveBeenCalledTimes(7);
    renderer.render(commands, 100, 50);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(2);
    renderer.render([], 50, 25);
    expect(canvas.width).toBe(50);
    renderer.dispose();
  });
  it('culls empty/offscreen commands, skips zero blur and validates geometry', () => {
    const { gl, canvas } = gpuFixture(),
      renderer = new GpuSceneRenderer({ canvas });
    renderer.render(
      [solid({ rect: { ...rect, x: 100 } }), solid({ rect: { ...rect, width: 0 } }), { kind: 'blur', rect, radius: 0 }],
      50,
      25,
    );
    expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    for (const bad of [
      solid({ rect: { ...rect, x: NaN } }),
      solid({ rect: { ...rect, width: -1 } }),
      solid({ color: [NaN, 0, 0, 1] }),
      solid({ color: [2, 0, 0, 1] }),
      { kind: 'blur', rect, radius: -1 } as const,
    ])
      expect(() => renderer.render([bad], 50, 25)).toThrow('Invalid');
    expect(() => renderer.render([solid(), solid({ rect: { ...rect, width: -1 } })], 50, 25)).toThrow('solid');
    renderer.dispose();
    expect(() => renderer.render([], 50, 25)).toThrow('unavailable');
  });
  it('handles context loss and restoration without exposing stale textures', () => {
    const { gl, canvas } = gpuFixture(),
      renderer = new GpuSceneRenderer({ canvas });
    renderer.render([image()], 50, 25);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(() => renderer.render([], 50, 25)).toThrow('unavailable');
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    renderer.render([image()], 50, 25);
    expect(gl.createProgram).toHaveBeenCalledTimes(4);
    expect(renderer.stats().textures).toBe(1);
    vi.mocked(gl.isContextLost).mockReturnValueOnce(true);
    expect(() => renderer.render([], 50, 25)).toThrow('unavailable');
    renderer.dispose();
  });
  it('reports output, target allocation and framebuffer failures and releases partial targets', () => {
    const { gl, canvas } = gpuFixture(),
      renderer = new GpuSceneRenderer({ canvas });
    for (const dimensions of [
      [0, 1],
      [NaN, 1],
      [1.5, 1],
      [5000, 1],
    ])
      expect(() => renderer.render([], dimensions[0]!, dimensions[1]!)).toThrow('dimensions');
    vi.mocked(gl.createTexture).mockReturnValueOnce(null as unknown as WebGLTexture);
    expect(() => renderer.render([], 50, 25)).toThrow('texture');
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    vi.mocked(gl.texStorage2D).mockImplementationOnce(() => {
      throw new Error('target upload failed');
    });
    expect(() => renderer.render([], 50, 25)).toThrow('target upload failed');
    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
    expect(renderer.stats().renderTargetBytes).toBe(0);
    renderer.dispose();
  });
  it('rejects an unsupported framebuffer during initialization before rendering', () => {
    const { gl, canvas } = gpuFixture();
    vi.mocked(gl.checkFramebufferStatus).mockReturnValueOnce(0);
    expect(() => new GpuSceneRenderer({ canvas })).toThrow('incomplete');
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
  });
  it('does not query framebuffer status across ten destination resizes and Gaussian scenes', () => {
    const { gl, canvas } = gpuFixture();
    const renderer = new GpuSceneRenderer({ canvas });
    expect(gl.checkFramebufferStatus).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 10; index++)
      renderer.render([{ kind: 'blur', rect, radius: 2 }], 50 + index, 25 + index);
    expect(gl.checkFramebufferStatus).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });
  it('fails explicitly if WebGL2 or scene resources are unavailable', () => {
    const fixture = gpuFixture();
    vi.mocked(fixture.canvas.getContext).mockReturnValueOnce(null);
    expect(() => new GpuSceneRenderer({ canvas: fixture.canvas })).toThrow('WebGL2');
    for (const method of ['createFramebuffer', 'createTexture'] as const) {
      const { gl, canvas } = gpuFixture();
      vi.mocked(gl[method]).mockReturnValueOnce(null as unknown as ReturnType<(typeof gl)[typeof method]>);
      expect(() => new GpuSceneRenderer({ canvas })).toThrow(
        method === 'createFramebuffer' ? 'framebuffer' : 'texture',
      );
      expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    }
    const { canvas } = gpuFixture();
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {
          return canvas;
        }
      },
    );
    const renderer = new GpuSceneRenderer();
    renderer.render([], 1, 1);
    renderer.dispose();
  });
});
