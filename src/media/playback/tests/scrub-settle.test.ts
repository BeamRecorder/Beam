import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrubSettle } from '../scrub-settle';

afterEach(() => vi.useRealTimers());
describe('scrub refinement', () => {
  it('waits for the quiet interval and fires only once', () => {
    vi.useFakeTimers();
    const settle = new ScrubSettle();
    const resolve = vi.fn();
    settle.schedule(resolve);
    vi.advanceTimersByTime(119);
    expect(resolve).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(resolve).toHaveBeenCalledOnce();
    settle.cancel();
  });
  it('replaces obsolete work rather than queuing every pointer event', () => {
    vi.useFakeTimers();
    const settle = new ScrubSettle();
    const old = vi.fn(),
      latest = vi.fn();
    settle.schedule(old);
    vi.advanceTimersByTime(100);
    settle.schedule(latest);
    vi.advanceTimersByTime(119);
    expect(latest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(latest).toHaveBeenCalledOnce();
    expect(old).not.toHaveBeenCalled();
  });
  it('cancels on exact seek, playback or disposal, including repeated cancellation', () => {
    vi.useFakeTimers();
    const settle = new ScrubSettle();
    const resolve = vi.fn();
    settle.cancel();
    settle.schedule(resolve);
    settle.cancel();
    settle.cancel();
    vi.runAllTimers();
    expect(resolve).not.toHaveBeenCalled();
  });
});
