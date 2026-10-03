import { describe, expect, it, vi } from 'vitest';
import { createHtmlPlaybackController } from './playback-controller.cjs';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
describe('headless HTML playback controller', () => {
  it('retains the latest clock while loading, then seeks synchronously without a frame delay', async () => {
    const seek = vi.fn(),
      failed = vi.fn();
    const player = createHtmlPlaybackController({ seek, failed });
    expect(player.state).toBe('waiting');
    player.seek(50);
    player.seek(800);
    expect(seek).not.toHaveBeenCalled();
    await player.start();
    expect(seek).toHaveBeenCalledExactlyOnceWith(800);
    player.seek(12000);
    expect(seek).toHaveBeenLastCalledWith(12000);
    player.seek(3000);
    expect(seek).toHaveBeenLastCalledWith(3000);
    await player.start();
    expect(seek).toHaveBeenCalledTimes(3);
    expect(player.state).toBe('ready');
    expect(failed).not.toHaveBeenCalled();
  });
  it('coalesces slow asynchronous frames instead of queueing an obsolete playback history', async () => {
    let finish!: () => void;
    const seek = vi.fn((time: number) =>
      time === 100
        ? new Promise<void>((resolve) => {
            finish = resolve;
          })
        : undefined,
    );
    const player = createHtmlPlaybackController({ seek, failed: vi.fn() });
    await player.start();
    player.seek(100);
    for (const time of [200, 300, 400, 900]) player.seek(time);
    expect(seek.mock.calls).toEqual([[0], [100]]);
    finish();
    await flush();
    expect(seek.mock.calls).toEqual([[0], [100], [900]]);
  });
  it('rejects invalid clocks and reports synchronous and asynchronous source failures once', async () => {
    for (const seek of [
      () => {
        throw new Error('sync failure');
      },
      async () => {
        throw new Error('async failure');
      },
    ]) {
      const failed = vi.fn();
      const player = createHtmlPlaybackController({ seek, failed });
      for (const time of [NaN, Infinity, -1]) expect(() => player.seek(time)).toThrow(RangeError);
      await player.start();
      expect(player.state).toBe('failed');
      expect(failed).toHaveBeenCalledOnce();
      player.seek(50);
      await player.start();
      expect(failed).toHaveBeenCalledOnce();
    }
  });
  it('stops pending frames on teardown and discards late failures', async () => {
    let fail!: (error: Error) => void;
    const seek = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    const failed = vi.fn();
    const player = createHtmlPlaybackController({ seek, failed });
    const starting = player.start();
    player.seek(700);
    player.dispose();
    fail(new Error('closed source'));
    await starting;
    player.seek(900);
    await player.start();
    expect(player.state).toBe('disposed');
    expect(seek).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });
  it('allows disposal before source readiness and cancels queued frames after a successful pending seek', async () => {
    const adapter = { seek: vi.fn(), failed: vi.fn() };
    const waiting = createHtmlPlaybackController(adapter);
    waiting.dispose();
    await waiting.start();
    expect(adapter.seek).not.toHaveBeenCalled();
    let finish!: () => void;
    const seek = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const player = createHtmlPlaybackController({ seek, failed: vi.fn() });
    const starting = player.start();
    player.seek(600);
    player.dispose();
    finish();
    await starting;
    expect(seek).toHaveBeenCalledOnce();
  });
});
