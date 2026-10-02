import { describe, expect, it, vi } from 'vitest';
import { GpuFilterTargetPool } from '../gpu-filter-target-pool';
import { gpuFilterFixture } from './gpu-filter.test-support';

describe('retained exact-size GPU filter targets', () => {
  it('reuses exact dimensions without allocation and distinguishes equal-area aspect ratios', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl);
    const portrait = pool.get(2, 4);
    expect(pool.get(2, 4)).toBe(portrait);
    const landscape = pool.get(4, 2);
    expect(landscape.texture).not.toBe(portrait.texture);
    expect(landscape).toMatchObject({ width: 4, height: 2 });
    expect(gl.createTexture).toHaveBeenCalledTimes(2);
    expect(gl.texStorage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 1, gl.RGBA8, 4, 2);
    expect(pool.stats()).toEqual({ entries: 2, bytes: 64 });
    pool.dispose();
  });

  it('evicts the least recently used geometry at its entry-count limit', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl, 1024, 2);
    const a = pool.get(2, 2);
    const b = pool.get(3, 3);
    expect(pool.get(2, 2)).toBe(a);
    const c = pool.get(4, 4);
    expect(vi.mocked(gl.deleteTexture).mock.calls[0]?.[0]).toBe(b.texture);
    expect(vi.mocked(gl.deleteTexture).mock.calls[0]?.[0]).not.toBe(a.texture);
    expect(pool.stats()).toEqual({ entries: 2, bytes: 80 });
    expect(pool.get(4, 4)).toBe(c);
    expect(pool.get(3, 3).texture).not.toBe(b.texture);
    expect(pool.stats().entries).toBe(2);
    pool.dispose();
  });

  it('evicts geometry to satisfy the byte bound even below the entry limit', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl, 32, 3);
    const a = pool.get(2, 2);
    pool.get(1, 4);
    expect(pool.stats()).toEqual({ entries: 2, bytes: 32 });
    pool.get(3, 1);
    expect(vi.mocked(gl.deleteTexture).mock.calls[0]?.[0]).toBe(a.texture);
    expect(pool.stats()).toEqual({ entries: 2, bytes: 28 });
    pool.dispose();
  });

  it('admits a target exactly at the budget and rejects larger geometry before allocation', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl, 16);
    const target = pool.get(2, 2);
    expect(pool.stats().bytes).toBe(16);
    expect(() => pool.get(3, 2)).toThrow(RangeError);
    expect(gl.createTexture).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(pool.get(2, 2)).toBe(target);
    pool.dispose();
  });

  it('preserves the old target and recency when allocation fails before an eviction', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl, 32, 1);
    const target = pool.get(2, 2);
    vi.mocked(gl.createTexture).mockReturnValueOnce(null!);
    expect(() => pool.get(3, 2)).toThrow('texture allocation');
    expect(pool.stats()).toEqual({ entries: 1, bytes: 16 });
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(pool.get(2, 2)).toBe(target);
    pool.dispose();
  });

  it('releases a failed storage allocation but retains every previously owned target', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl, 32, 1);
    const target = pool.get(2, 2);
    vi.mocked(gl.texStorage2D).mockImplementationOnce(() => {
      throw new Error('storage failed');
    });
    expect(() => pool.get(3, 2)).toThrow('storage failed');
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(vi.mocked(gl.deleteTexture).mock.calls[0]?.[0]).not.toBe(target.texture);
    expect(pool.stats()).toEqual({ entries: 1, bytes: 16 });
    expect(pool.get(2, 2)).toBe(target);
    pool.dispose();
  });

  it.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [NaN, 1],
    [1, Infinity],
    [4097, 1],
    [1, 4097],
    [Number.MAX_SAFE_INTEGER + 1, 1],
  ])('rejects invalid or device-exceeding dimensions %s×%s without retaining an allocation', (width, height) => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl);
    expect(() => pool.get(width!, height!)).toThrow(RangeError);
    expect(pool.stats()).toEqual({ entries: 0, bytes: 0 });
    expect(gl.createTexture).not.toHaveBeenCalled();
    pool.dispose();
  });

  it.each([
    [0, 1],
    [3, 1],
    [NaN, 1],
    [Infinity, 1],
    [4.5, 1],
    [4, 0],
    [4, -1],
    [4, 1.5],
  ])('rejects invalid budgets %s or capacities %s before allocation', (bytes, capacity) => {
    const { gl } = gpuFilterFixture();
    expect(() => new GpuFilterTargetPool(gl, bytes, capacity)).toThrow(RangeError);
    expect(gl.createTexture).not.toHaveBeenCalled();
  });

  it('uses the default 32-entry limit without accumulating discarded textures', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl);
    for (let width = 1; width <= 33; width++) pool.get(width, 1);
    expect(pool.stats().entries).toBe(32);
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    pool.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(33);
    const created = vi.mocked(gl.createTexture).mock.results.map((result) => result.value);
    const deleted = vi.mocked(gl.deleteTexture).mock.calls.map(([texture]) => texture);
    expect(new Set(deleted).size).toBe(created.length);
    for (const texture of created) expect(deleted.filter((value) => value === texture)).toHaveLength(1);
  });

  it('releases every retained allocation exactly once and refuses access after disposal', () => {
    const { gl } = gpuFilterFixture();
    const pool = new GpuFilterTargetPool(gl);
    pool.get(2, 2);
    pool.get(4, 4);
    pool.dispose();
    pool.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(pool.stats()).toEqual({ entries: 0, bytes: 0 });
    expect(() => pool.get(2, 2)).toThrow('disposed');
  });
});
