import type { PrepareRecording } from '../recorder/capture-preparation-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewSelectionCountdown } from './development-countdown';
const capture = vi.hoisted(() => ({
  setCountdown: vi.fn().mockResolvedValue(undefined),
  showHud: vi.fn(),
  onCountdownCancelled: vi.fn<(listener: () => void) => () => void>(() => vi.fn()),
}));
vi.mock('~/api/capture', () => ({ capture }));
afterEach(() => {
  vi.useRealTimers();
  capture.showHud.mockClear();
  capture.setCountdown.mockReset().mockResolvedValue(undefined);
  capture.onCountdownCancelled.mockReset().mockImplementation(() => vi.fn());
});

describe('development data selection handoff', () => {
  it('reuses the real countdown window and hides it after three ticks', async () => {
    vi.useFakeTimers();
    const result = previewSelectionCountdown();
    await vi.advanceTimersByTimeAsync(3000);
    await result;
    expect(capture.setCountdown.mock.calls.map(([seconds]) => seconds)).toEqual([3, 2, 1, null]);
  });
  it('hides countdown after initial presentation fails', async () => {
    capture.setCountdown.mockRejectedValueOnce(new Error('Closed'));
    await expect(previewSelectionCountdown()).rejects.toThrow('Closed');
    expect(capture.setCountdown).toHaveBeenLastCalledWith(null);
  });
  it('hides countdown after a later update fails', async () => {
    vi.useFakeTimers();
    capture.setCountdown.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Renderer stopped'));
    const result = expect(previewSelectionCountdown()).rejects.toThrow('Renderer stopped');
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(capture.setCountdown).toHaveBeenLastCalledWith(null);
  });
  it('uses the configured duration rather than a fixed three seconds', async () => {
    vi.useFakeTimers();
    const result = previewSelectionCountdown(5);
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(capture.setCountdown.mock.calls.map(([seconds]) => seconds)).toEqual([5, 4, 3, 2, 1, null]);
  });
  it.each([0, -1])('skips the countdown and subscriptions at %s', async (duration) => {
    await previewSelectionCountdown(duration);
    expect(capture.setCountdown).not.toHaveBeenCalled();
    expect(capture.onCountdownCancelled).not.toHaveBeenCalled();
  });
  it('wakes and hides immediately when cancelled during a tick', async () => {
    vi.useFakeTimers();
    let cancel = () => {};
    const unsubscribe = vi.fn();
    capture.onCountdownCancelled.mockImplementation((listener: () => void) => {
      cancel = listener;
      return unsubscribe;
    });
    const result = previewSelectionCountdown(3);
    await vi.advanceTimersByTimeAsync(999);
    cancel();
    await result;
    await vi.advanceTimersByTimeAsync(5000);
    expect(capture.setCountdown.mock.calls.map(([seconds]) => seconds)).toEqual([3, null]);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not install a tick after cancellation while presentation is pending', async () => {
    vi.useFakeTimers();
    let cancel = () => {};
    let presented = () => {};
    capture.onCountdownCancelled.mockImplementation((listener: () => void) => {
      cancel = listener;
      return vi.fn();
    });
    capture.setCountdown.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          presented = resolve;
        }),
    );
    const result = previewSelectionCountdown();
    cancel();
    presented();
    await result;
    expect(capture.setCountdown.mock.calls.map(([seconds]) => seconds)).toEqual([3, null]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0, 3])('previews the manual preparation stage even with a %ss countdown', async (duration) => {
    vi.useFakeTimers();
    let begin!: () => Promise<void>;
    const prepare = vi.fn(async (_request: Parameters<PrepareRecording>[0], start: Parameters<PrepareRecording>[1]) => {
      begin = () => start(_request.settings);
    });
    await previewSelectionCountdown(duration, prepare);
    expect(capture.setCountdown).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledWith(
      { settings: expect.objectContaining({ countdownSeconds: duration }) },
      expect.any(Function),
    );
    const countdown = begin();
    await vi.advanceTimersByTimeAsync(duration * 1000);
    await countdown;
    expect(capture.showHud).toHaveBeenCalledOnce();
  });
  it('restores the HUD if the development countdown fails after confirmation', async () => {
    capture.setCountdown.mockRejectedValueOnce(new Error('Countdown failed'));
    await expect(previewSelectionCountdown(3, async (request, start) => start(request.settings))).rejects.toThrow(
      'Countdown failed',
    );
    expect(capture.showHud).toHaveBeenCalledOnce();
  });
});
