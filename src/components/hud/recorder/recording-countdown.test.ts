import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({ setCountdown: vi.fn(), onCountdownCancelled: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
import { createRecordingCountdown } from './recording-countdown';

describe('recording countdown', () => {
  let cancelEvent: () => void;
  const unsubscribe = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    capture.onCountdownCancelled.mockImplementation((listener: () => void) => {
      cancelEvent = listener;
      return unsubscribe;
    });
  });
  afterEach(() => vi.useRealTimers());

  it.each([0, -1])('starts immediately at %s without a countdown or cancellation subscription', (duration) => {
    const elapsed = vi.fn();
    createRecordingCountdown(ref(duration)).start(elapsed, vi.fn());
    expect(elapsed).toHaveBeenCalledOnce();
    expect(capture.setCountdown).not.toHaveBeenCalled();
    expect(capture.onCountdownCancelled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('counts down once and ignores cancellation after recording has started', () => {
    const remaining = ref(3);
    const elapsed = vi.fn();
    const cancel = vi.fn();
    createRecordingCountdown(remaining).start(elapsed, cancel);
    vi.advanceTimersByTime(10_000);
    expect(capture.setCountdown.mock.calls.map(([value]) => value)).toEqual([3, 2, 1, null]);
    expect(remaining.value).toBe(0);
    expect(elapsed).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    cancelEvent();
    expect(cancel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels just before zero without launching or accepting a second cancellation', () => {
    const elapsed = vi.fn();
    const cancel = vi.fn();
    createRecordingCountdown(ref(1)).start(elapsed, cancel);
    vi.advanceTimersByTime(999);
    cancelEvent();
    cancelEvent();
    vi.advanceTimersByTime(5000);
    expect(cancel).toHaveBeenCalledOnce();
    expect(elapsed).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears a pending countdown and subscription during owner teardown', () => {
    const elapsed = vi.fn();
    const countdown = createRecordingCountdown(ref(3));
    countdown.start(elapsed, vi.fn());
    countdown.clear();
    countdown.clear();
    vi.advanceTimersByTime(5000);
    expect(elapsed).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('replaces the timer on restart instead of launching both callbacks', () => {
    const first = vi.fn();
    const second = vi.fn();
    const countdown = createRecordingCountdown(ref(1));
    countdown.start(first, vi.fn());
    countdown.start(second, vi.fn());
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
