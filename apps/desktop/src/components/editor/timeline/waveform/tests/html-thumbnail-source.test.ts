import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createHtmlThumbnailSource } from '../html-thumbnail-source';
import { htmlPreviewFixture } from '../../../../authoring/html-dom-preview.fixtures';
import type { MediaProcessingReporter } from '../../../performance/media-processing-pressure';
const bridge = vi.hoisted(() => ({ renderHtmlFrame: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: bridge }));
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await nextTick();
};
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());
function setup() {
  const pressure = { update: vi.fn(), error: vi.fn(), dispose: vi.fn() } as unknown as MediaProcessingReporter;
  let urls = 0;
  const services = {
    render: vi.fn(async () => new Blob(['frame'])),
    createUrl: vi.fn(() => `blob:${++urls}`),
    revokeUrl: vi.fn(),
    dispose: vi.fn(),
  };
  const source = createHtmlThumbnailSource(htmlPreviewFixture().html, pressure, services);
  return { source, services, pressure };
}
describe('HTML timeline thumbnails', () => {
  it('progressively captures during continuous playback without overlapping or bursting', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.source.setActivity(false, true);
    f.source.requestVisibleFrames([1, 2, 3], 960);
    await flush();
    expect(f.services.render.mock.calls).toEqual([[1000, 240]]);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(50);
      f.source.requestVisibleFrames([1, 2, 3], 960);
    }
    expect(f.services.render).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(f.services.render).toHaveBeenLastCalledWith(2000, 240);
    expect(f.source.thumbnails[2]).toBeDefined();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.services.render).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    f.source.dispose();
  });
  it('uses the latest viewport at the next budget slot and refines immediately when interaction ends', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.source.setActivity(false, true);
    f.source.requestVisibleFrames([1, 2], 480);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    f.source.requestVisibleFrames([1, 7], 480);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.services.render.mock.calls).toEqual([
      [1000, 240],
      [7000, 240],
    ]);
    const cached = f.source.thumbnails[1];
    f.source.setActivity(false, false);
    await flush();
    expect(f.services.render.mock.calls.slice(2)).toEqual([
      [1000, 480],
      [7000, 480],
    ]);
    expect(f.services.revokeUrl).toHaveBeenCalledWith(cached);
    expect(vi.getTimerCount()).toBe(0);
    f.source.dispose();
  });
  it('cancels paced jobs on empty viewports, readiness loss, cache reset and disposal', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.source.setActivity(false, true);
    f.source.requestVisibleFrames([1, 2]);
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    f.source.requestVisibleFrames([]);
    expect(vi.getTimerCount()).toBe(0);
    f.source.requestVisibleFrames([2]);
    expect(vi.getTimerCount()).toBe(1);
    f.source.setActivity(true, true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.services.render).toHaveBeenCalledTimes(1);
    f.source.setActivity(false, true);
    await flush();
    f.source.requestVisibleFrames([3]);
    expect(vi.getTimerCount()).toBe(1);
    f.source.clearCache();
    expect(vi.getTimerCount()).toBe(0);
    f.source.requestVisibleFrames([4]);
    expect(vi.getTimerCount()).toBe(1);
    f.source.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.services.render).toHaveBeenCalledTimes(2);
  });
  it('continues after a slow capture without scheduling concurrent renders or extra timers', async () => {
    vi.useFakeTimers();
    const f = setup();
    let finish!: (blob: Blob) => void;
    f.services.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    f.source.setActivity(false, true);
    f.source.requestVisibleFrames([1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    f.source.requestVisibleFrames([1, 2]);
    expect(f.services.render).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    finish(new Blob());
    await flush();
    expect(f.services.render).toHaveBeenCalledTimes(2);
    f.source.dispose();
  });
  it('defers queued captures before the editor is ready while retaining cached frames', async () => {
    const f = setup();
    f.source.requestVisibleFrames([1]);
    await flush();
    const cached = f.source.thumbnails[1];
    f.source.setActivity(true, false);
    f.source.requestVisibleFrames([1, 2, 3]);
    await flush();
    expect(f.services.render).toHaveBeenCalledTimes(1);
    expect(f.source.thumbnails[1]).toBe(cached);
    expect(f.source.isExtracting.value).toBe(false);
    f.source.setActivity(false, false);
    await flush();
    expect(f.services.render.mock.calls).toEqual([
      [1000, 240],
      [2000, 240],
      [3000, 240],
    ]);
    f.source.dispose();
  });
  it('stops after an in-flight capture when readiness is lost, then renders only the newest viewport', async () => {
    const f = setup();
    let finish!: (blob: Blob) => void;
    f.services.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    f.source.requestVisibleFrames([1, 2, 3]);
    f.source.setActivity(true, false);
    f.source.requestVisibleFrames([7]);
    finish(new Blob());
    await flush();
    expect(f.services.render).toHaveBeenCalledTimes(1);
    expect(f.source.thumbnails[1]).toBeUndefined();
    f.source.setActivity(false, false);
    await flush();
    expect(f.services.render).toHaveBeenLastCalledWith(7000, 240);
    expect(Object.keys(f.source.thumbnails)).toEqual(['7']);
    f.source.dispose();
  });
  it('preserves suspension across cache resets and never restarts disposed sources', async () => {
    const f = setup();
    f.source.setActivity(true, false);
    f.source.requestVisibleFrames([1]);
    f.source.clearCache();
    f.source.requestVisibleFrames([3]);
    await flush();
    expect(f.services.render).not.toHaveBeenCalled();
    f.source.dispose();
    f.source.setActivity(false, false);
    await flush();
    expect(f.services.render).not.toHaveBeenCalled();
  });
  it('samples requested source clocks at exact frame boundaries and ignores invalid/duplicate times', async () => {
    const f = setup();
    f.source.requestVisibleFrames([0, 1.01, 20, 1.01, NaN, -1, Infinity]);
    await flush();
    expect(f.services.render.mock.calls).toEqual([
      [0, 240],
      [1000, 240],
      [15000, 240],
    ]);
    expect(Object.keys(f.source.thumbnails)).toHaveLength(3);
    expect(f.source.isExtracting.value).toBe(false);
    f.source.dispose();
  });
  it('reuses cached frames and upgrades only when the viewport requests wider thumbnails', async () => {
    const f = setup();
    f.source.requestVisibleFrames([1]);
    await flush();
    f.source.requestVisibleFrames([1], 100);
    await flush();
    expect(f.services.render).toHaveBeenCalledTimes(1);
    f.source.requestVisibleFrames([1], 480);
    await flush();
    expect(f.services.render).toHaveBeenLastCalledWith(1000, 480);
    expect(f.services.revokeUrl).toHaveBeenCalledWith('blob:1');
    expect(f.source.widths[1]).toBe(480);
    f.source.dispose();
  });
  it('serializes renders and discards old viewport samples', async () => {
    let complete!: (blob: Blob) => void;
    const f = setup();
    f.services.render.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          complete = resolve;
        }),
    );
    f.source.requestVisibleFrames([1, 2]);
    f.source.requestVisibleFrames([4]);
    expect(f.services.render).toHaveBeenCalledTimes(1);
    complete(new Blob());
    await flush();
    expect(f.services.render).toHaveBeenLastCalledWith(4000, 240);
    expect(Object.keys(f.source.thumbnails)).toEqual(['4']);
    f.source.dispose();
  });
  it('bounds both viewport requests and retained blob URLs, evicting older frames', async () => {
    const f = setup();
    f.source.requestVisibleFrames(Array.from({ length: 120 }, (_, i) => i));
    for (let i = 0; i < 30; i++) await flush();
    expect(Object.keys(f.source.thumbnails)).toHaveLength(96);
    f.source.requestVisibleFrames([200]);
    await flush();
    expect(Object.keys(f.source.thumbnails)).toHaveLength(96);
    expect(f.source.thumbnails[0]).toBeUndefined();
    expect(f.services.revokeUrl).toHaveBeenCalledWith('blob:1');
    f.source.dispose();
    expect(f.services.revokeUrl).toHaveBeenCalledTimes(97);
  });
  it('reports failures once, then allows explicit cache clearing to retry', async () => {
    const f = setup();
    f.services.render.mockRejectedValueOnce(new Error('missing HTML'));
    f.source.requestVisibleFrames([1]);
    await flush();
    expect(f.source.error.value).toContain('missing HTML');
    expect(f.pressure.error).toHaveBeenCalledTimes(1);
    f.source.requestVisibleFrames([1]);
    await flush();
    expect(f.services.render).toHaveBeenCalledTimes(1);
    f.source.clearCache();
    f.source.requestVisibleFrames([1]);
    await flush();
    expect(f.source.error.value).toBeNull();
    expect(f.source.thumbnails[1]).toBe('blob:1');
    f.source.dispose();
  });
  it('starts a new cache generation when an obsolete pending render fails', async () => {
    const f = setup();
    let fail!: (error: Error) => void;
    f.services.render.mockImplementationOnce(
      () =>
        new Promise<Blob>((_, reject) => {
          fail = reject;
        }),
    );
    f.source.requestVisibleFrames([1]);
    f.source.clearCache();
    f.source.requestVisibleFrames([3]);
    fail(new Error('obsolete'));
    await flush();
    expect(f.source.thumbnails[3]).toBe('blob:1');
    expect(f.source.error.value).toBeNull();
    f.source.dispose();
  });
  it('releases URLs, ignores pending completion and subsequent requests after disposal', async () => {
    const f = setup();
    let complete!: (blob: Blob) => void;
    f.source.requestVisibleFrames([1]);
    await flush();
    f.services.render.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          complete = resolve;
        }),
    );
    f.source.requestVisibleFrames([2]);
    f.source.dispose();
    f.source.dispose();
    complete(new Blob());
    await flush();
    f.source.requestVisibleFrames([3]);
    expect(Object.keys(f.source.thumbnails)).toHaveLength(0);
    expect(f.services.render).toHaveBeenCalledTimes(2);
    expect(f.pressure.dispose).toHaveBeenCalledTimes(1);
  });
});
