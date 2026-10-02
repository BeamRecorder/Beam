import { describe, expect, it, vi } from 'vitest';
import { EngineMetrics } from '../../performance/engine-metrics';
import { GpuTimer } from '../gpu-timer';
import { gpuFixture } from './gpu-fixtures';

describe('asynchronous hardware GPU metrics', () => {
  it('records actual elapsed nanoseconds and closes completed queries', () => {
    const { gl } = gpuFixture(),
      metrics = new EngineMetrics({ enabled: true }),
      timer = new GpuTimer(gl, metrics);
    timer.begin();
    timer.begin();
    timer.end();
    timer.end();
    timer.poll();
    timer.clear();
    expect(gl.beginQuery).toHaveBeenCalledOnce();
    expect(gl.deleteQuery).toHaveBeenCalledOnce();
    expect(metrics.snapshot().stages['gpu-execute']?.latestMs).toBe(1);
  });
  it('is inert when hardware timestamps are unavailable or allocation fails', () => {
    const { gl } = gpuFixture();
    vi.mocked(gl.getExtension).mockReturnValue(null);
    const timer = new GpuTimer(gl, new EngineMetrics());
    timer.begin();
    timer.end();
    timer.poll();
    timer.clear();
    expect(gl.createQuery).not.toHaveBeenCalled();
    vi.mocked(gl.getExtension).mockReturnValue({
      TIME_ELAPSED_EXT: 1001,
      GPU_DISJOINT_EXT: 1002,
    } as unknown as WEBGL_multi_draw);
    vi.mocked(gl.createQuery).mockReturnValue(null as unknown as WebGLQuery);
    const unavailable = new GpuTimer(gl, new EngineMetrics());
    unavailable.begin();
    unavailable.end();
    expect(gl.beginQuery).not.toHaveBeenCalled();
  });
  it('bounds pending queries to eight and discards disjoint measurements', () => {
    const { gl } = gpuFixture();
    vi.mocked(gl.getQueryParameter).mockReturnValue(false);
    const timer = new GpuTimer(gl, new EngineMetrics({ enabled: true }));
    for (let i = 0; i < 12; i++) {
      timer.begin();
      timer.end();
    }
    expect(gl.createQuery).toHaveBeenCalledTimes(8);
    vi.mocked(gl.getParameter).mockReturnValue(true);
    timer.poll();
    expect(gl.deleteQuery).toHaveBeenCalledTimes(8);
    vi.mocked(gl.getParameter).mockReturnValue(false);
    timer.begin();
    timer.clear();
    expect(gl.deleteQuery).toHaveBeenCalledTimes(9);
  });
  it.each([NaN, -1, 'not a timestamp'])('discards invalid timestamp %s', (invalid) => {
    const { gl } = gpuFixture(),
      metrics = new EngineMetrics({ enabled: true });
    vi.mocked(gl.getQueryParameter).mockImplementation((_q, key) =>
      key === gl.QUERY_RESULT_AVAILABLE ? true : invalid,
    );
    const timer = new GpuTimer(gl, metrics);
    timer.begin();
    timer.end();
    timer.poll();
    expect(metrics.snapshot().stages['gpu-execute']).toBeUndefined();
    expect(gl.deleteQuery).toHaveBeenCalledOnce();
  });
});
