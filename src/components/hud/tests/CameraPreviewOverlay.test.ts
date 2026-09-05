import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FrameCallback = (now: number, metadata: { width: number; height: number }) => void;

const { capture } = vi.hoisted(() => ({
  capture: { configureCameraOverlay: vi.fn() },
}));
vi.mock('../../../api/capture', () => ({ capture }));

import CameraPreviewOverlay from '../camera/CameraPreviewOverlay.vue';

class FakeTrack {
  stop = vi.fn();
}

const requestVideoFrameCallbackDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  'requestVideoFrameCallback',
);
const cancelVideoFrameCallbackDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  'cancelVideoFrameCallback',
);
const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

let getUserMedia: ReturnType<typeof vi.fn>;
let track: FakeTrack;
let stream: MediaStream;
let requestVideoFrameCallback: ReturnType<typeof vi.fn>;
let cancelVideoFrameCallback: ReturnType<typeof vi.fn>;
let frameCallbacks: Map<number, FrameCallback>;
let nextFrameCallbackId: number;

const flushPromises = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const expectEventually = async (assertion: () => void) => {
  for (let index = 0; index < 20; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (index === 19) throw error;
      await Promise.resolve();
    }
  }
};

const emitFirstFrame = (width = 1280, height = 720) => {
  [...frameCallbacks.values()].forEach((callback) => callback(0, { width, height }));
};

const restoreDescriptor = (target: object, key: string, descriptor: PropertyDescriptor | undefined) => {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete (target as Record<string, unknown>)[key];
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  frameCallbacks = new Map();
  nextFrameCallbackId = 0;
  requestVideoFrameCallback = vi.fn((callback: FrameCallback) => {
    const id = ++nextFrameCallbackId;
    frameCallbacks.set(id, callback);
    return id;
  });
  cancelVideoFrameCallback = vi.fn((id: number) => frameCallbacks.delete(id));
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    value: requestVideoFrameCallback,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
    configurable: true,
    value: cancelVideoFrameCallback,
  });

  track = new FakeTrack();
  stream = { getTracks: () => [track] } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: capture,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreDescriptor(HTMLVideoElement.prototype, 'requestVideoFrameCallback', requestVideoFrameCallbackDescriptor);
  restoreDescriptor(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', cancelVideoFrameCallbackDescriptor);
  restoreDescriptor(navigator, 'mediaDevices', mediaDevicesDescriptor);
  delete window.capture;
});

describe('CameraPreviewOverlay', () => {
  it('loads a camera only after its first frame and cleans up the stream', async () => {
    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: 'camera:chromium:front', isHovered: true },
    });
    await expectEventually(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: { deviceId: { exact: 'front' } },
      }),
    );
    expect(requestVideoFrameCallback).toHaveBeenCalledOnce();
    expect(wrapper.get('.camera-overlay-container').classes()).toContain('is-hovered');
    expect(wrapper.find('.camera-overlay-skeleton').exists()).toBe(true);

    emitFirstFrame();
    await flushPromises();
    expect(wrapper.find('.camera-overlay-skeleton').exists()).toBe(false);

    wrapper.unmount();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('requests a camera only once when the selection arrives during initial mounting', async () => {
    const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: 'off' } });

    await wrapper.setProps({ cameraId: 'camera:chromium:front' });
    await expectEventually(() => expect(getUserMedia).toHaveBeenCalled());

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { deviceId: { exact: 'front' } },
    });
    emitFirstFrame();
    await flushPromises();

    wrapper.unmount();
  });

  it('does not request the disabled camera and shows hardware errors', async () => {
    const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: 'off' } });
    await flushPromises();
    expect(getUserMedia).not.toHaveBeenCalled();

    getUserMedia.mockRejectedValueOnce(new DOMException('Could not start video source', 'NotReadableError'));
    await wrapper.setProps({ cameraId: 'camera:chromium:broken' });
    await expectEventually(() => expect(wrapper.find('.camera-overlay-error').exists()).toBe(true));
    expect(capture.configureCameraOverlay).toHaveBeenCalledWith({ cameraId: 'off' });
    wrapper.unmount();
  });

  it('stops a stale stream when the selected camera changes while loading', async () => {
    let resolveRequest!: (value: MediaStream) => void;
    const staleTrack = new FakeTrack();
    const staleStream = { getTracks: () => [staleTrack] } as unknown as MediaStream;
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: 'camera:chromium:first' },
    });
    await expectEventually(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    await wrapper.setProps({ cameraId: 'off' });
    resolveRequest(staleStream);
    await expectEventually(() => expect(staleTrack.stop).toHaveBeenCalledOnce());
    wrapper.unmount();
  });

  it('serializes camera requests when the selection changes during an in-flight request', async () => {
    let resolveFirst!: (value: MediaStream) => void;
    const firstTrack = new FakeTrack();
    const firstStream = { getTracks: () => [firstTrack] } as unknown as MediaStream;
    const secondTrack = new FakeTrack();
    const secondStream = { getTracks: () => [secondTrack] } as unknown as MediaStream;
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    getUserMedia.mockResolvedValueOnce(secondStream);

    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: 'camera:chromium:first' },
    });
    await expectEventually(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    await wrapper.setProps({ cameraId: 'camera:chromium:second' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    resolveFirst(firstStream);
    await expectEventually(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: false,
      video: { deviceId: { exact: 'second' } },
    });
    expect(firstTrack.stop).toHaveBeenCalledOnce();
    emitFirstFrame();
    await flushPromises();

    wrapper.unmount();
  });

  it('aborts a pending first frame before opening a changed camera and stops the old track', async () => {
    const firstTrack = new FakeTrack();
    const firstStream = { getTracks: () => [firstTrack] } as unknown as MediaStream;
    const secondTrack = new FakeTrack();
    const secondStream = { getTracks: () => [secondTrack] } as unknown as MediaStream;
    getUserMedia.mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream);

    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: 'camera:chromium:first' },
    });
    await expectEventually(() => expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1));

    await wrapper.setProps({ cameraId: 'camera:chromium:second' });
    await expectEventually(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(cancelVideoFrameCallback).toHaveBeenCalledOnce();
    expect(firstTrack.stop).toHaveBeenCalledOnce();

    emitFirstFrame();
    await flushPromises();
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
  });

  it('exposes readyStream only after the selected stream has produced its first frame', async () => {
    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: 'camera:chromium:front' },
    });
    await expectEventually(() => expect(requestVideoFrameCallback).toHaveBeenCalledOnce());

    const readyStream = (wrapper.vm as unknown as { readyStream(sourceId: string): Promise<MediaStream> }).readyStream;
    const ready = readyStream('camera:chromium:front');
    let settled = false;
    void ready.then(() => {
      settled = true;
    });
    await flushPromises();
    expect(settled).toBe(false);

    emitFirstFrame();
    const resolvedStream = await ready;
    expect(resolvedStream.getTracks()).toEqual([track]);
    await expect(readyStream('camera:chromium:other')).rejects.toMatchObject({ name: 'NotReadableError' });

    wrapper.unmount();
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
