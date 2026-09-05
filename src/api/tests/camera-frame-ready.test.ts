import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForFirstCameraFrame } from '../camera-frame-ready';

type FrameCallback = (now: number, metadata: { width: number; height: number }) => void;

const requestVideoFrameCallbackDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  'requestVideoFrameCallback',
);
const cancelVideoFrameCallbackDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  'cancelVideoFrameCallback',
);

const defineDimensions = (video: HTMLVideoElement, width = 1280, height = 720) => {
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: width });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: height });
};

const restoreDescriptor = (target: object, key: string, descriptor: PropertyDescriptor | undefined) => {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete (target as Record<string, unknown>)[key];
};

describe('waitForFirstCameraFrame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreDescriptor(HTMLVideoElement.prototype, 'requestVideoFrameCallback', requestVideoFrameCallbackDescriptor);
    restoreDescriptor(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', cancelVideoFrameCallbackDescriptor);
  });

  it('waits for a positive-dimension requestVideoFrameCallback frame and cancels the callback on cleanup', async () => {
    const video = document.createElement('video');
    const callbacks = new Map<number, FrameCallback>();
    const requestVideoFrameCallback = vi.fn((callback: FrameCallback) => {
      const id = callbacks.size + 1;
      callbacks.set(id, callback);
      return id;
    });
    const cancelVideoFrameCallback = vi.fn((id: number) => callbacks.delete(id));
    Object.defineProperty(video, 'requestVideoFrameCallback', { configurable: true, value: requestVideoFrameCallback });
    Object.defineProperty(video, 'cancelVideoFrameCallback', { configurable: true, value: cancelVideoFrameCallback });

    const promise = waitForFirstCameraFrame(video, { timeoutMs: 100 });
    await Promise.resolve();
    expect(requestVideoFrameCallback).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(1);

    callbacks.get(1)?.(0, { width: 1280, height: 720 });
    await expect(promise).resolves.toBeUndefined();
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(1);
  });

  it('rejects when the selected camera does not produce a frame before the timeout', async () => {
    const video = document.createElement('video');
    const cancelVideoFrameCallback = vi.fn();
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      configurable: true,
      value: vi.fn(() => 7),
    });
    Object.defineProperty(video, 'cancelVideoFrameCallback', { configurable: true, value: cancelVideoFrameCallback });

    const result = expect(waitForFirstCameraFrame(video, { timeoutMs: 250 })).rejects.toMatchObject({
      name: 'NotReadableError',
    });
    await vi.advanceTimersByTimeAsync(250);
    await result;
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(7);
  });

  it('rejects with AbortError and removes the pending frame callback when cancelled', async () => {
    const video = document.createElement('video');
    const controller = new AbortController();
    const cancelVideoFrameCallback = vi.fn();
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      configurable: true,
      value: vi.fn(() => 11),
    });
    Object.defineProperty(video, 'cancelVideoFrameCallback', { configurable: true, value: cancelVideoFrameCallback });

    const promise = waitForFirstCameraFrame(video, { signal: controller.signal, timeoutMs: 250 });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(11);
  });

  it('uses loadeddata as a fallback when requestVideoFrameCallback is unavailable', async () => {
    const video = document.createElement('video');
    defineDimensions(video);
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });

    const promise = waitForFirstCameraFrame(video, { timeoutMs: 100 });
    video.dispatchEvent(new Event('loadeddata'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects a callback that reports no video dimensions', async () => {
    const video = document.createElement('video');
    let callback: FrameCallback | undefined;
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      configurable: true,
      value: vi.fn((next: FrameCallback) => {
        callback = next;
        return 13;
      }),
    });

    const promise = waitForFirstCameraFrame(video, { timeoutMs: 100 });
    await Promise.resolve();
    callback?.(0, { width: 0, height: 0 });

    await expect(promise).rejects.toMatchObject({ name: 'NotReadableError' });
  });
});
