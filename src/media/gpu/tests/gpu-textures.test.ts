import { describe, expect, it, vi } from 'vitest';
import { EngineMetrics } from '../../performance/engine-metrics';
import { GpuTextures } from '../gpu-textures';
import { gpuFilterFixture as gpuFixture } from './gpu-filter.test-support';

const source = () => ({ close: vi.fn() }) as unknown as TexImageSource;
describe('retained GPU textures', () => {
  it('reuploads equal-area images when their width and height changed', () => {
    const { gl } = gpuFixture(),
      pool = new GpuTextures(gl, new EngineMetrics()),
      frame = source();
    pool.get(frame, 2, 4, true);
    pool.get(frame, 4, 2, true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    pool.clear();
  });
  it.each([
    [3, 1],
    [4, 0],
    [NaN, 1],
    [4, 1.5],
  ])('rejects invalid budgets %s / %s', (bytes, capacity) => {
    expect(() => new GpuTextures(gpuFixture().gl, new EngineMetrics(), bytes, capacity)).toThrow('budget');
  });
  it('uploads an immutable frame once and reuses aliases with LRU eviction', () => {
    const { gl } = gpuFixture(),
      metrics = new EngineMetrics({ enabled: true }),
      pool = new GpuTextures(gl, metrics, 32, 2);
    const a = source(),
      b = source(),
      c = source();
    const texture = pool.get(a, 2, 2, true);
    pool.get(b, 2, 2, true);
    expect(pool.get(a, 2, 2, true)).toBe(texture);
    pool.get(c, 2, 2, true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(3);
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(pool.stats()).toEqual({ textures: 2, bytes: 32 });
    expect(metrics.snapshot().counters.uploads).toBe(3);
    pool.clear();
    pool.clear();
    expect(pool.stats()).toEqual({ textures: 0, bytes: 0 });
    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
    expect((a as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
  });
  it('reuploads mutable sources and resized immutable images, respecting byte limits', () => {
    const { gl } = gpuFixture(),
      pool = new GpuTextures(gl, new EngineMetrics(), 64, 8),
      a = source();
    const texture = pool.get(a, 2, 2, true);
    expect(pool.get(a, 2, 2, false)).toBe(texture);
    pool.get(a, 4, 4, true);
    pool.get(source(), 2, 2, true);
    expect(gl.texImage2D).toHaveBeenCalledTimes(3);
    expect(gl.texSubImage2D).toHaveBeenCalledOnce();
    expect(pool.stats()).toEqual({ textures: 1, bytes: 16 });
    pool.clear();
  });
  it.each([
    [0, 1],
    [1, -1],
    [1.5, 1],
    [NaN, 1],
    [4097, 1],
    [10000, 10000],
  ])('rejects invalid dimensions %s / %s', (width, height) => {
    expect(() => new GpuTextures(gpuFixture().gl, new EngineMetrics()).get(source(), width, height, true)).toThrow(
      'source',
    );
  });
  it('releases failed uploads and reports allocation failure without retaining a source', () => {
    const { gl } = gpuFixture(),
      pool = new GpuTextures(gl, new EngineMetrics());
    vi.mocked(gl.createTexture).mockReturnValueOnce(null as unknown as WebGLTexture);
    expect(() => pool.get(source(), 1, 1, true)).toThrow('allocate');
    vi.mocked(gl.texImage2D).mockImplementationOnce(() => {
      throw new Error('upload failed');
    });
    expect(() => pool.get(source(), 1, 1, true)).toThrow('upload failed');
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(pool.stats().bytes).toBe(0);
  });
  it('removes a cached texture after a mutable sub-image upload failure', () => {
    const { gl } = gpuFixture(),
      metrics = new EngineMetrics({ enabled: true }),
      pool = new GpuTextures(gl, metrics),
      frame = source();
    const first = pool.get(frame, 2, 2, false);
    vi.mocked(gl.texSubImage2D).mockImplementationOnce(() => {
      throw new Error('mutable upload failed');
    });
    expect(() => pool.get(frame, 2, 2, false)).toThrow('mutable upload failed');
    expect(pool.stats()).toEqual({ textures: 0, bytes: 0 });
    expect(gl.deleteTexture).toHaveBeenCalledWith(first);
    expect(metrics.snapshot().counters.uploads).toBe(1);
    expect(pool.get(frame, 2, 2, false)).not.toBe(first);
    pool.clear();
  });
});
