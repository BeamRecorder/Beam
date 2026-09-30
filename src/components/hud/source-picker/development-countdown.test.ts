import { afterEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({ setCountdown: vi.fn().mockResolvedValue(undefined) }));
vi.mock('~/api/capture', () => ({ capture }));
import { previewSelectionCountdown } from './development-countdown';
afterEach(() => {
  vi.useRealTimers();
  capture.setCountdown.mockReset().mockResolvedValue(undefined);
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
});
