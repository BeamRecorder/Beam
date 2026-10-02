import { describe, expect, it, vi } from 'vitest';
import { EngineMetrics } from '../../performance/engine-metrics';
import { GpuGaussianPass } from '../gpu-gaussian-pass';
import type { GpuFilterTarget } from '../gpu-filter-types';
import { gpuFilterFixture } from './gpu-filter.test-support';

const source = (width = 20, height = 10): GpuFilterTarget => ({ texture: {} as WebGLTexture, width, height });

describe('retained GPU Gaussian passes', () => {
  it('pads a transparent halo and uses distinct targets with normalized horizontal and vertical taps', () => {
    const { gl, draws } = gpuFilterFixture();
    const metrics = new EngineMetrics({ enabled: true });
    const pass = new GpuGaussianPass(gl, metrics);
    const input = source();
    const result = pass.filter(input, 2);
    expect(draws).toHaveLength(3);
    expect(draws[0]?.viewport).toEqual([8, 8, 20, 10]);
    expect(draws[1]?.viewport).toEqual([0, 0, 36, 26]);
    expect(draws[2]?.viewport).toEqual([0, 0, 36, 26]);
    expect(new Set(draws.map((draw) => draw.target)).size).toBe(3);
    expect(draws.every((draw) => draw.source !== draw.target)).toBe(true);
    expect(draws[0]?.source).toBe(input.texture);
    expect(result.texture).toBe(draws[2]?.target);
    expect(result.uv).toEqual([8 / 36, 8 / 26, 20 / 36, 10 / 26]);
    expect(draws[1]?.uniforms.get('u_direction')).toEqual([1 / 36, 0]);
    expect(draws[2]?.uniforms.get('u_direction')).toEqual([0, 1 / 26]);
    const weights = draws[1]?.uniforms.get('u_weights') as number[];
    const center = draws[1]?.uniforms.get('u_center') as number;
    expect(center + 2 * weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 7);
    expect(metrics.snapshot().counters.draws).toBe(3);
    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(gl.clear).toHaveBeenCalledOnce();
    pass.dispose();
  });

  it('reduces large sigma in real-sized steps before applying the bounded final kernel', () => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const result = pass.filter(source(20, 10), 48, true);
    expect(draws[0]?.viewport).toEqual([146, 146, 20, 10]);
    expect(draws[0]?.uniforms.get('u_uvRect')).toEqual([0, 1, 1, -1]);
    expect(draws.map((draw) => draw.viewport)).toEqual([
      [146, 146, 20, 10],
      [0, 0, 156, 151],
      [0, 0, 78, 75],
      [0, 0, 39, 37],
      [0, 0, 26, 25],
      [0, 0, 26, 25],
      [0, 0, 26, 25],
    ]);
    expect(result.width).toBe(26);
    expect(result.height).toBe(25);
    expect(draws.slice(1).every((draw) => JSON.stringify(draw.uniforms.get('u_uvRect')) === '[0,0,1,1]')).toBe(true);
    expect(draws.at(-2)?.uniforms.get('u_pairs')).toBe(6);
    pass.dispose();
  });

  it('makes even a one-pixel mask represent a high sigma without clamping the original blur', () => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const result = pass.filter(source(1, 1), 48);
    expect(result.width).toBe(24);
    expect(result.height).toBe(24);
    expect(result.uv).toEqual([146 / 293, 146 / 293, 1 / 293, 1 / 293]);
    expect(draws.at(-1)?.uniforms.get('u_pairs')).toBeLessThanOrEqual(6);
    pass.dispose();
  });

  it('keeps identity samples transparent-padded and bypasses convolution taps', () => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    pass.filter(source(), 0);
    expect(draws).toHaveLength(1);
    expect(draws[0]?.uniforms.get('u_mode')).toBe(0);
    expect(gl.uniform1fv).not.toHaveBeenCalled();
    expect(pass.stats().bytes).toBe(24 * 14 * 4);
    pass.dispose();
  });

  it.each([false, true])('samples a top-left ROI with explicit source flip %s', (flipSource) => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const result = pass.filter(source(100, 50), 1, flipSource, { x: 10, y: 5, width: 20, height: 10 });
    expect(draws[0]?.viewport).toEqual([5, 5, 20, 10]);
    expect(draws[0]?.uniforms.get('u_uvRect')).toEqual(flipSource ? [0.1, 0.3, 0.2, -0.2] : [0.1, 0.7, 0.2, 0.2]);
    expect(result.width).toBe(30);
    expect(result.height).toBe(20);
    expect(result.uv).toEqual([5 / 30, 5 / 20, 20 / 30, 10 / 20]);
    pass.dispose();
  });

  it.each([
    { x: -1 },
    { y: -1 },
    { x: NaN },
    { y: 0.5 },
    { width: 0 },
    { height: -1 },
    { width: 1.5 },
    { x: 95 },
    { y: 45 },
  ])('rejects invalid source ROI %j before target allocation', (patch) => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    expect(() => pass.filter(source(100, 50), 1, false, { x: 10, y: 5, width: 20, height: 10, ...patch })).toThrow(
      'source crop',
    );
    expect(gl.createTexture).toHaveBeenCalledOnce();
    pass.dispose();
  });

  it.each([0, 2, 48])('rejects its own retained texture before feedback or eviction at sigma %s', (sigma) => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const input = source();
    const result = pass.filter(input, sigma);
    const count = draws.length;
    const stats = pass.stats();
    const allocated = vi.mocked(gl.createTexture).mock.calls.length;
    expect(() => pass.filter(result, sigma)).toThrow('own retained targets');
    if (sigma === 0) {
      expect(() => pass.filter(result, 0, false, { x: 2, y: 2, width: 20, height: 10 })).toThrow(
        'own retained targets',
      );
    }
    expect(draws).toHaveLength(count);
    expect(gl.createTexture).toHaveBeenCalledTimes(allocated);
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(pass.stats()).toEqual(stats);
    expect(pass.filter(input, sigma).texture).toBe(result.texture);
    pass.dispose();
  });

  it('can consume a target owned by a different Gaussian pass without false alias rejection', () => {
    const { gl, draws } = gpuFilterFixture();
    const first = new GpuGaussianPass(gl, new EngineMetrics());
    const second = new GpuGaussianPass(gl, new EngineMetrics());
    const result = first.filter(source(), 2);
    expect(() => second.filter(result, 1)).not.toThrow();
    expect(draws.every((draw) => draw.source !== draw.target)).toBe(true);
    first.dispose();
    second.dispose();
  });

  it.each([0, 2, 48])('reuses an immutable filtered result without any draw at sigma %s', (sigma) => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const input = source();
    const first = pass.filter(input, sigma, false, undefined, true);
    const drawn = draws.length;
    const checks = vi.mocked(gl.checkFramebufferStatus).mock.calls.length;
    const clears = vi.mocked(gl.clear).mock.calls.length;
    expect(pass.filter(input, sigma, false, undefined, true)).toBe(first);
    expect(draws).toHaveLength(drawn);
    expect(gl.checkFramebufferStatus).toHaveBeenCalledTimes(checks);
    expect(gl.clear).toHaveBeenCalledTimes(clears);
    expect(pass.stats().entries).toBe(1);
    pass.dispose();
  });

  it.each(['sigma', 'crop-x', 'crop-y', 'crop-width', 'flip', 'source'] as const)(
    'does not alias immutable results with a changed %s',
    (changed) => {
      const { gl, draws } = gpuFilterFixture();
      const pass = new GpuGaussianPass(gl, new EngineMetrics());
      const input = source(100, 50);
      const crop = { x: 10, y: 5, width: 20, height: 10 };
      const first = pass.filter(input, 2.001, false, crop, true);
      const count = draws.length;
      const other = pass.filter(
        changed === 'source' ? source(100, 50) : input,
        changed === 'sigma' ? 2.002 : 2.001,
        changed === 'flip',
        {
          ...crop,
          ...(changed === 'crop-x'
            ? { x: 11 }
            : changed === 'crop-y'
              ? { y: 6 }
              : changed === 'crop-width'
                ? { width: 21 }
                : {}),
        },
        true,
      );
      expect(other.texture).not.toBe(first.texture);
      expect(draws.length).toBeGreaterThan(count);
      expect(pass.stats().entries).toBe(2);
      pass.dispose();
    },
  );

  it('never caches mutable backdrop contents even when an immutable identity was previously admitted', () => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const input = source();
    const immutable = pass.filter(input, 2, false, undefined, true);
    pass.filter(input, 2);
    const count = draws.length;
    pass.filter(input, 2);
    expect(draws).toHaveLength(count + 3);
    expect(pass.filter(input, 2, false, undefined, true)).toBe(immutable);
    expect(draws).toHaveLength(count + 3);
    pass.dispose();
  });

  it('invalidates immutable result entries on LRU eviction and keeps hits recently used', () => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const inputs = Array.from({ length: 9 }, () => source());
    const initial = pass.filter(inputs[0]!, 2, false, undefined, true);
    const evicted = pass.filter(inputs[1]!, 2, false, undefined, true);
    for (let index = 2; index < 8; index++) pass.filter(inputs[index]!, 2, false, undefined, true);
    expect(pass.filter(inputs[0]!, 2, false, undefined, true)).toBe(initial);
    pass.filter(inputs[8]!, 2, false, undefined, true);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    const count = draws.length;
    expect(pass.filter(inputs[0]!, 2, false, undefined, true)).toBe(initial);
    expect(draws).toHaveLength(count);
    expect(pass.filter(inputs[1]!, 2, false, undefined, true).texture).not.toBe(evicted.texture);
    expect(draws).toHaveLength(count + 3);
    pass.dispose();
  });

  it('validates source, crop, sigma and context before returning an immutable hit', () => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    const input = source();
    const result = pass.filter(input, 2, false, undefined, true);
    const count = draws.length;
    expect(() => pass.filter(result, 2, false, undefined, true)).toThrow('own retained targets');
    expect(() => pass.filter({ ...input, width: 0 }, 2, false, undefined, true)).toThrow(RangeError);
    expect(() => pass.filter(input, NaN, false, undefined, true)).toThrow(RangeError);
    expect(() => pass.filter(input, 2, false, { x: -1, y: 0, width: 20, height: 10 }, true)).toThrow('source crop');
    vi.mocked(gl.isContextLost).mockReturnValueOnce(true);
    expect(() => pass.filter(input, 2, false, undefined, true)).toThrow('unavailable');
    expect(draws).toHaveLength(count);
    pass.dispose();
  });

  it('reuses equal geometry and evicts the least recently used set at eight entries', () => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    pass.filter(source(), 1);
    const initial = vi.mocked(gl.createTexture).mock.calls.length;
    pass.filter(source(), 1);
    expect(gl.createTexture).toHaveBeenCalledTimes(initial);
    for (let width = 21; width <= 27; width++) pass.filter(source(width), 1);
    expect(pass.stats().entries).toBe(8);
    pass.filter(source(), 1);
    pass.filter(source(28), 1);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    const before = vi.mocked(gl.createTexture).mock.calls.length;
    pass.filter(source(), 1);
    expect(gl.createTexture).toHaveBeenCalledTimes(before);
    pass.dispose();
    expect(pass.stats()).toEqual({ entries: 0, bytes: 0 });
  });

  it('evicts old sizes to respect the byte budget without accumulating allocations', () => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics(), 7000);
    pass.filter(source(10, 10), 1);
    pass.filter(source(11, 10), 1);
    expect(pass.stats().entries).toBe(1);
    expect(pass.stats().bytes).toBeLessThanOrEqual(7000);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    pass.dispose();
  });

  it.each([0, 3, 4.5, NaN, Infinity])('rejects invalid budget %s before program allocation', (budget) => {
    const { gl } = gpuFilterFixture();
    expect(() => new GpuGaussianPass(gl, new EngineMetrics(), budget)).toThrow('budget');
    expect(gl.createProgram).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid retained-set capacity %s before allocation', (capacity) => {
    const { gl } = gpuFilterFixture();
    expect(() => new GpuGaussianPass(gl, new EngineMetrics(), 128 * 2 ** 20, capacity)).toThrow('budget');
    expect(gl.createProgram).not.toHaveBeenCalled();
  });

  it('respects an explicit retained-set capacity independently of the byte budget', () => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics(), 128 * 2 ** 20, 2);
    for (let index = 0; index < 3; index++) pass.filter(source(), 1, false, undefined, true);
    expect(pass.stats().entries).toBe(2);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    pass.dispose();
  });

  it('rejects invalid dimensions, sigma, padded device bounds and over-budget domains', () => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics(), 4000);
    for (const [width, height, sigma] of [
      [0, 1, 1],
      [1.5, 1, 1],
      [1, 1, -1],
      [1, 1, 49],
      [1, 1, NaN],
    ]) {
      expect(() => pass.filter(source(width, height), sigma!)).toThrow(RangeError);
    }
    expect(() => pass.filter(source(4096, 1), 1)).toThrow('budget or device');
    expect(() => pass.filter(source(100, 100), 1)).toThrow('budget or device');
    expect(gl.createTexture).toHaveBeenCalledOnce();
    pass.dispose();
  });

  it('releases allocated programs after framebuffer failure and all targets after partial allocation failure', () => {
    const failed = gpuFilterFixture();
    vi.mocked(failed.gl.createFramebuffer).mockReturnValueOnce(null!);
    expect(() => new GpuGaussianPass(failed.gl, new EngineMetrics())).toThrow('framebuffer allocation');
    expect(failed.gl.deleteProgram).toHaveBeenCalledOnce();
    expect(failed.gl.deleteVertexArray).toHaveBeenCalledOnce();

    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    vi.mocked(gl.createTexture)
      .mockReturnValueOnce({} as WebGLTexture)
      .mockReturnValueOnce(null!);
    expect(() => pass.filter(source(), 1)).toThrow('texture allocation');
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(pass.stats()).toEqual({ entries: 0, bytes: 0 });
    pass.dispose();
  });

  it('rejects unsupported framebuffer formats during initialization', () => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl.checkFramebufferStatus).mockReturnValueOnce(0);
    expect(() => new GpuGaussianPass(gl, new EngineMetrics())).toThrow('incomplete');
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
  });

  it('rejects context loss and use after idempotent disposal', () => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    vi.mocked(gl.isContextLost).mockReturnValueOnce(true);
    expect(() => pass.filter(source(), 1)).toThrow('unavailable');
    pass.dispose();
    pass.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(() => pass.filter(source(), 1)).toThrow('unavailable');
  });

  it('performs no framebuffer status queries across ten new filter dimensions', () => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics());
    expect(gl.checkFramebufferStatus).toHaveBeenCalledOnce();
    for (let index = 0; index < 10; index++) pass.filter(source(31 + index, 20 + index), 2);
    expect(gl.checkFramebufferStatus).toHaveBeenCalledOnce();
    pass.dispose();
  });

  it.each([0, -1, 1.5, 129, NaN, Infinity])(
    'rejects invalid allocation alignment %s before allocation',
    (alignment) => {
      const { gl } = gpuFilterFixture();
      expect(() => new GpuGaussianPass(gl, new EngineMetrics(), 128 * 2 ** 20, 8, alignment)).toThrow('budget');
      expect(gl.createProgram).not.toHaveBeenCalled();
    },
  );

  it('reuses aligned targets for 31→32 pixel mutable regions without changing sigma or sampled UVs', () => {
    const { gl, draws } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics(), 128 * 2 ** 20, 8, 64);
    const input = source(100, 50);
    const first = pass.filter(input, 2, false, { x: 0, y: 0, width: 31, height: 20 });
    const allocations = vi.mocked(gl.createTexture).mock.calls.length;
    const second = pass.filter(input, 2, false, { x: 0, y: 0, width: 32, height: 20 });
    expect(first.texture).toBe(second.texture);
    expect(gl.createTexture).toHaveBeenCalledTimes(allocations);
    expect(first.uv).toEqual([8 / 64, 8 / 64, 31 / 64, 20 / 64]);
    expect(second.uv).toEqual([8 / 64, 8 / 64, 32 / 64, 20 / 64]);
    expect(second.width).toBe(64);
    expect(second.height).toBe(64);
    expect(draws.at(-2)?.uniforms.get('u_center')).toBeCloseTo(0.19967562749792112, 7);
    expect(draws.at(-2)?.uniforms.get('u_direction')).toEqual([1 / 64, 0]);
    expect(draws.at(-1)?.uniforms.get('u_direction')).toEqual([0, 1 / 64]);
    pass.dispose();
  });

  it('does not alias immutable 31→32 pixel crops even when their padded allocation bucket matches', () => {
    const { gl } = gpuFilterFixture();
    const pass = new GpuGaussianPass(gl, new EngineMetrics(), 128 * 2 ** 20, 8, 64);
    const input = source(100, 50);
    const first = pass.filter(input, 2, false, { x: 0, y: 0, width: 31, height: 20 }, true);
    const second = pass.filter(input, 2, false, { x: 0, y: 0, width: 32, height: 20 }, true);
    expect(second.texture).not.toBe(first.texture);
    expect(first.uv).toEqual([8 / 64, 8 / 64, 31 / 64, 20 / 64]);
    expect(second.uv).toEqual([8 / 64, 8 / 64, 32 / 64, 20 / 64]);
    pass.dispose();
  });
});
