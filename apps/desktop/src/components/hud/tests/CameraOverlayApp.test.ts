import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraRecordingCommand } from '../../../api/types/camera-recording';
import { defineComponent, h } from 'vue';

const capture = vi.hoisted(() => ({
  status: vi.fn(),
  getCameraOverlayState: vi.fn(),
  onCameraOverlayState: vi.fn(),
  onCameraOverlayHover: vi.fn(),
  onCameraOverlayRecordingCommand: vi.fn(),
  completeCameraOverlayRecordingCommand: vi.fn(),
  notifyCameraOverlayReady: vi.fn(),
  configureCameraOverlay: vi.fn(),
  reportCameraRecordingFailure: vi.fn(),
  beginCameraSegment: vi.fn(),
  writeCameraSegment: vi.fn(),
  finalizeCameraSegment: vi.fn(),
  failCamera: vi.fn(),
}));
vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../../stores/theme', () => ({
  useThemeStore: () => ({ theme: 'dark' }),
}));

import CameraOverlayApp from '../camera/CameraOverlayApp.vue';

const readyStream = vi.fn();

const CameraPreviewOverlay = defineComponent({
  props: ['cameraId', 'isRecording', 'isHovered'],
  setup(props, { expose }) {
    expose({ readyStream });
    return () => h('div', { class: 'camera-preview-stub' }, props.cameraId);
  },
});

type Listener = (...args: unknown[]) => void;

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  readonly stream: MediaStream;
  readonly options: MediaRecorderOptions;
  readonly start = vi.fn();
  readonly stop = vi.fn(() => this.dispatchEvent(new Event('stop')));

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    super();
    this.stream = stream;
    this.options = options;
    FakeMediaRecorder.instances.push(this);
  }
}

const createTrack = () => {
  const listeners = new Map<string, Listener[]>();
  return {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== listener),
      );
    }),
    getSettings: vi.fn(() => ({ width: 1280, height: 720, frameRate: 30 })),
    stop: vi.fn(),
    emit: (type: string) => listeners.get(type)?.forEach((listener) => listener()),
  };
};

let recordingCommand!: (command: CameraRecordingCommand) => void;
let sharedTrack: ReturnType<typeof createTrack>;
let sharedStream: MediaStream;
let previousMediaDevices: MediaDevices | undefined;
let previousCapture: typeof window.capture | undefined;

describe('CameraOverlayApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeMediaRecorder.instances = [];
    sharedTrack = createTrack();
    sharedStream = {
      getVideoTracks: () => [sharedTrack],
      getTracks: () => [sharedTrack],
    } as unknown as MediaStream;
    readyStream.mockResolvedValue(sharedStream);
    previousMediaDevices = navigator.mediaDevices;
    previousCapture = window.capture;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(window, 'capture', {
      configurable: true,
      value: capture,
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    capture.status.mockResolvedValue({ state: 'recording' });
    capture.getCameraOverlayState.mockResolvedValue({
      cameraId: 'camera:front',
    });
    capture.onCameraOverlayState.mockReturnValue(() => undefined);
    capture.onCameraOverlayHover.mockReturnValue(() => undefined);
    capture.onCameraOverlayRecordingCommand.mockImplementation(
      (listener: (command: CameraRecordingCommand) => void) => {
        recordingCommand = listener;
        return () => undefined;
      },
    );
    capture.completeCameraOverlayRecordingCommand.mockReset();
    capture.notifyCameraOverlayReady.mockReset();
    capture.configureCameraOverlay.mockReset();
    capture.reportCameraRecordingFailure.mockReset();
    capture.beginCameraSegment.mockResolvedValue({ jobId: 'camera-job-1' });
    capture.writeCameraSegment.mockResolvedValue(undefined);
    capture.finalizeCameraSegment.mockResolvedValue(undefined);
    capture.failCamera.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: previousMediaDevices,
    });
    if (previousCapture)
      Object.defineProperty(window, 'capture', {
        configurable: true,
        value: previousCapture,
      });
    else delete (window as { capture?: unknown }).capture;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads state and tracks recording state', async () => {
    let stateListener!: (state: { cameraId: string }) => void;
    let hoverListener!: (hovered: boolean) => void;
    const stopState = vi.fn();
    const stopHover = vi.fn();
    capture.onCameraOverlayState.mockImplementation((listener) => {
      stateListener = listener;
      return stopState;
    });
    capture.onCameraOverlayHover.mockImplementation((listener) => {
      hoverListener = listener;
      return stopHover;
    });
    const wrapper = mount(CameraOverlayApp, {
      global: { stubs: { CameraPreviewOverlay } },
    });
    await vi.waitFor(() => expect(capture.status).toHaveBeenCalled());
    stateListener({ cameraId: 'camera:back' });
    hoverListener(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('camera:back');
    wrapper.unmount();
    expect(stopState).toHaveBeenCalledOnce();
    expect(stopHover).toHaveBeenCalledOnce();
    expect(capture.notifyCameraOverlayReady).toHaveBeenCalledOnce();
  });

  it('clears recording state when the native status call fails', async () => {
    capture.status.mockRejectedValue(new Error('status unavailable'));
    capture.getCameraOverlayState.mockResolvedValue(null);
    const wrapper = mount(CameraOverlayApp, {
      global: { stubs: { CameraPreviewOverlay } },
    });
    await vi.waitFor(() => expect(capture.status).toHaveBeenCalled());
    wrapper.unmount();
  });

  it('runs every camera command on the preview stream without opening a second media stream', async () => {
    capture.beginCameraSegment
      .mockResolvedValueOnce({ jobId: 'camera-job-1' })
      .mockResolvedValueOnce({ jobId: 'camera-job-2' });
    const wrapper = mount(CameraOverlayApp, {
      global: { stubs: { CameraPreviewOverlay } },
    });
    await vi.waitFor(() => expect(capture.notifyCameraOverlayReady).toHaveBeenCalledOnce());

    const send = async (control: CameraRecordingCommand['control'], commandId: string) => {
      recordingCommand({ commandId, recordingId: 'recording-1', control });
      await vi.waitFor(() =>
        expect(capture.completeCameraOverlayRecordingCommand).toHaveBeenCalledWith(
          expect.objectContaining({ commandId, ok: true }),
        ),
      );
    };

    await send({ action: 'prepare', sourceId: 'camera:chromium:front' }, 'command-prepare');
    await send(
      {
        action: 'start',
        recordingId: 'recording-1',
        sessionId: 'session-1',
        startNs: 5_000_000_000,
      },
      'command-start',
    );
    await send({ action: 'pause', recordingId: 'recording-1', endNs: 100 }, 'command-pause');
    await send(
      {
        action: 'resume',
        recordingId: 'recording-1',
        sessionId: 'session-1',
        startNs: 200,
      },
      'command-resume',
    );
    await send({ action: 'stop', recordingId: 'recording-1', endNs: 300 }, 'command-stop');

    expect(readyStream).toHaveBeenCalledOnce();
    expect(FakeMediaRecorder.instances).toHaveLength(2);
    expect(FakeMediaRecorder.instances[0].stream).toBe(sharedStream);
    expect(FakeMediaRecorder.instances[1].stream).toBe(sharedStream);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(capture.beginCameraSegment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sessionId: 'session-1',
        startNs: 5_000_000_000,
      }),
    );
    expect(capture.finalizeCameraSegment).toHaveBeenCalledTimes(2);
    expect(capture.finalizeCameraSegment).toHaveBeenLastCalledWith(
      expect.objectContaining({ jobId: 'camera-job-2', endNs: 300 }),
    );
    expect(sharedTrack.stop).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('reports a fatal camera event and fails the active segment without stopping the shared preview track', async () => {
    const wrapper = mount(CameraOverlayApp, {
      global: { stubs: { CameraPreviewOverlay } },
    });
    await vi.waitFor(() => expect(capture.notifyCameraOverlayReady).toHaveBeenCalledOnce());

    const send = async (control: CameraRecordingCommand['control'], commandId: string) => {
      recordingCommand({ commandId, recordingId: 'recording-1', control });
      await vi.waitFor(() =>
        expect(capture.completeCameraOverlayRecordingCommand).toHaveBeenCalledWith(
          expect.objectContaining({ commandId, ok: true }),
        ),
      );
    };
    await send({ action: 'prepare', sourceId: 'camera:chromium:front' }, 'command-prepare');
    await send(
      {
        action: 'start',
        recordingId: 'recording-1',
        sessionId: 'session-1',
        startNs: 0,
      },
      'command-start',
    );

    sharedTrack.emit('ended');

    await vi.waitFor(() =>
      expect(capture.reportCameraRecordingFailure).toHaveBeenCalledWith({
        recordingId: 'recording-1',
        message: 'The selected camera was disconnected or stopped.',
      }),
    );
    expect(capture.failCamera).toHaveBeenCalledWith({
      sessionId: 'session-1',
      reason: 'The selected camera was disconnected or stopped.',
    });
    expect(capture.configureCameraOverlay).toHaveBeenCalledWith({
      cameraId: 'off',
    });
    expect(sharedTrack.stop).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('continues processing commands when fatal camera cleanup rejects', async () => {
    capture.failCamera.mockRejectedValueOnce(new Error('native cleanup failed'));
    const wrapper = mount(CameraOverlayApp, {
      global: { stubs: { CameraPreviewOverlay } },
    });
    await vi.waitFor(() => expect(capture.notifyCameraOverlayReady).toHaveBeenCalledOnce());

    const send = async (control: CameraRecordingCommand['control'], commandId: string) => {
      recordingCommand({ commandId, recordingId: 'recording-1', control });
      await vi.waitFor(() =>
        expect(capture.completeCameraOverlayRecordingCommand).toHaveBeenCalledWith(
          expect.objectContaining({ commandId, ok: true }),
        ),
      );
    };
    await send({ action: 'prepare', sourceId: 'camera:chromium:front' }, 'command-prepare');
    await send(
      {
        action: 'start',
        recordingId: 'recording-1',
        sessionId: 'session-1',
        startNs: 0,
      },
      'command-start',
    );

    sharedTrack.emit('ended');
    await vi.waitFor(() =>
      expect(capture.reportCameraRecordingFailure).toHaveBeenCalledWith(
        expect.objectContaining({ recordingId: 'recording-1' }),
      ),
    );

    recordingCommand({
      commandId: 'command-reprepare',
      recordingId: 'recording-2',
      control: { action: 'prepare', sourceId: 'camera:chromium:second' },
    });
    await vi.waitFor(() =>
      expect(capture.completeCameraOverlayRecordingCommand).toHaveBeenCalledWith({
        commandId: 'command-reprepare',
        ok: true,
        value: expect.objectContaining({ sourceId: 'camera:chromium:second' }),
      }),
    );

    wrapper.unmount();
  });
  const mountOverlay = async () => {
    const wrapper = mount(CameraOverlayApp, { global: { stubs: { CameraPreviewOverlay } } });
    await vi.waitFor(() => expect(capture.notifyCameraOverlayReady).toHaveBeenCalledOnce());
    return wrapper;
  };
  const sendControl = async (control: CameraRecordingCommand['control'], ok = true, id = 'recording-1') => {
    const commandId = String(capture.completeCameraOverlayRecordingCommand.mock.calls.length);
    recordingCommand({ commandId, recordingId: id, control });
    await vi.waitFor(() =>
      expect(capture.completeCameraOverlayRecordingCommand).toHaveBeenCalledWith(
        expect.objectContaining({ commandId, ok }),
      ),
    );
  };
  const prepare = () => sendControl({ action: 'prepare', sourceId: 'camera:chromium:front' });
  const startRecording = () =>
    sendControl({ action: 'start', recordingId: 'recording-1', sessionId: 'session-1', startNs: 0 });

  it('keeps only one status request outstanding while native capture is busy', async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (value: { state: string }) => void;
      capture.status.mockResolvedValueOnce({ state: 'recording' }).mockReturnValueOnce(
        new Promise((next) => {
          resolve = next;
        }),
      );
      const wrapper = await mountOverlay();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(capture.status).toHaveBeenCalledTimes(2);
      resolve({ state: 'paused' });
      await vi.advanceTimersByTimeAsync(500);
      expect(capture.status).toHaveBeenCalledTimes(3);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([false, true])(
    'does not restart polling after unmount during a pending status (failure=%s)',
    async (failure) => {
      vi.useFakeTimers();
      try {
        let finish!: () => void;
        capture.status.mockReturnValueOnce(
          new Promise((resolve, reject) => {
            finish = () => (failure ? reject(new Error('closed')) : resolve({ state: 'recording' }));
          }),
        );
        const wrapper = await mountOverlay();
        await vi.advanceTimersByTimeAsync(0);
        wrapper.unmount();
        finish();
        await vi.advanceTimersByTimeAsync(5000);
        expect(capture.status).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('does not install a timer if the camera state arrives after unmount', async () => {
    vi.useFakeTimers();
    try {
      let finish!: () => void;
      capture.getCameraOverlayState.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
      );
      const wrapper = await mountOverlay();
      wrapper.unmount();
      finish();
      await vi.advanceTimersByTimeAsync(1000);
      expect(capture.status).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects commands without a prepared recording and a preview without a ready stream', async () => {
    const wrapper = await mountOverlay();
    await sendControl({ action: 'stop', recordingId: 'missing', endNs: 0 }, false);
    readyStream.mockResolvedValueOnce(undefined);
    await sendControl({ action: 'prepare', sourceId: 'camera:chromium:front' }, false);
    expect(capture.completeCameraOverlayRecordingCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ name: 'NotReadableError' }) }),
    );
    wrapper.unmount();
  });
  it('can replace a prepared device and rejects replacement while recording', async () => {
    const wrapper = await mountOverlay();
    await prepare();
    await prepare();
    await startRecording();
    await sendControl({ action: 'prepare', sourceId: 'camera:chromium:front' }, false);
    await sendControl({ action: 'fail', recordingId: 'recording-1', sessionId: 'session-1', reason: 'driver stopped' });
    expect(capture.failCamera).toHaveBeenCalledWith({ sessionId: 'session-1', reason: 'driver stopped' });
    wrapper.unmount();
  });
  it('reports stop failures and releases the matching recorder', async () => {
    const wrapper = await mountOverlay();
    await prepare();
    await startRecording();
    capture.finalizeCameraSegment.mockRejectedValueOnce(new Error('disk full'));
    await sendControl({ action: 'stop', recordingId: 'recording-1', endNs: 1 }, false);
    expect(capture.failCamera).toHaveBeenCalledWith({ sessionId: 'session-1', reason: 'disk full' });
    await prepare();
    wrapper.unmount();
  });
  it('reports an idle device disconnect only once', async () => {
    const wrapper = await mountOverlay();
    await prepare();
    sharedTrack.emit('ended');
    await vi.waitFor(() => expect(capture.reportCameraRecordingFailure).toHaveBeenCalledOnce());
    expect(capture.failCamera).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('ignores a queued fatal notification after Stop already released its recorder', async () => {
    const wrapper = await mountOverlay();
    await prepare();
    await startRecording();
    const stopping = sendControl({ action: 'stop', recordingId: 'recording-1', endNs: 1 });
    sharedTrack.emit('ended');
    await stopping;
    await Promise.resolve();
    expect(capture.reportCameraRecordingFailure).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('finalizes an active segment when its overlay unmounts', async () => {
    const wrapper = await mountOverlay();
    await prepare();
    await startRecording();
    wrapper.unmount();
    await vi.waitFor(() =>
      expect(capture.failCamera).toHaveBeenCalledWith({
        sessionId: 'session-1',
        reason: 'The camera overlay was closed.',
      }),
    );
  });
  it.each([new Error('closing IPC failed'), 'closing IPC failed'])(
    'handles rejected teardown without an unhandled promise: %s',
    async (reason) => {
      const wrapper = await mountOverlay();
      await prepare();
      await startRecording();
      capture.failCamera.mockRejectedValueOnce(reason);
      wrapper.unmount();
      await vi.waitFor(() =>
        expect(capture.reportCameraRecordingFailure).toHaveBeenCalledWith({
          recordingId: 'recording-1',
          message: 'closing IPC failed',
        }),
      );
    },
  );
});
