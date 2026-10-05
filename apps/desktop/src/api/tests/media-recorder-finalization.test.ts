import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MEDIA_OPERATION_TIMEOUT_MS,
  stopBrowserMediaRecorder,
  withMediaDeadline,
} from '../media-recorder-finalization';

class Recorder extends EventTarget {
  state: RecordingState = 'recording';
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  });
}
afterEach(() => vi.useRealTimers());

describe('recording deadlines', () => {
  it('returns completed work and clears its watchdog', async () => {
    vi.useFakeTimers();
    await expect(withMediaDeadline(Promise.resolve(7), 'write')).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves the original failure and clears its watchdog', async () => {
    vi.useFakeTimers();
    await expect(withMediaDeadline(Promise.reject(new Error('disk full')), 'write')).rejects.toThrow('disk full');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a request that never responds', async () => {
    vi.useFakeTimers();
    const checked = expect(withMediaDeadline(new Promise(() => undefined), 'write', 10)).rejects.toThrow(
      'write timed out',
    );
    await vi.advanceTimersByTimeAsync(10);
    await checked;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('browser encoder stop', () => {
  const stop = (recorder: Recorder) => stopBrowserMediaRecorder(recorder as unknown as MediaRecorder, 'encoder');
  it('waits for the actual stop event and removes both event listeners', async () => {
    const recorder = new Recorder();
    const remove = vi.spyOn(recorder, 'removeEventListener');
    await stop(recorder);
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('accepts an encoder that is already inactive', async () => {
    const recorder = new Recorder();
    recorder.state = 'inactive';
    await stop(recorder);
    expect(recorder.stop).not.toHaveBeenCalled();
  });
  it('reports an encoder error during finalization', async () => {
    const recorder = new Recorder();
    recorder.stop.mockImplementation(() => {
      recorder.dispatchEvent(new Event('error'));
    });
    await expect(stop(recorder)).rejects.toThrow('encoder failed');
  });
  it('preserves synchronous stop exceptions', async () => {
    const recorder = new Recorder();
    recorder.stop.mockImplementation(() => {
      throw new Error('driver failure');
    });
    await expect(stop(recorder)).rejects.toThrow('driver failure');
  });
  it('bounds a missing stop event and cleans up late listeners', async () => {
    vi.useFakeTimers();
    const recorder = new Recorder();
    recorder.stop.mockImplementation(() => undefined);
    const remove = vi.spyOn(recorder, 'removeEventListener');
    const checked = expect(stop(recorder)).rejects.toThrow('encoder timed out');
    await vi.advanceTimersByTimeAsync(MEDIA_OPERATION_TIMEOUT_MS);
    await checked;
    expect(remove).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    recorder.dispatchEvent(new Event('stop'));
  });
});
