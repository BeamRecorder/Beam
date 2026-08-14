import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecordingController } from '../recorder/useRecordingController';
import type { RecordingConfiguration } from '../recorder/recording-types';

const { capture, cameraApi, microphoneApi, systemApi } = vi.hoisted(() => ({
  capture: {
    getCameraOverlayState: vi.fn(),
    setCountdown: vi.fn().mockResolvedValue(undefined),
    prepareRecordingSurface: vi.fn().mockResolvedValue(undefined),
    hideScreenRegionOverlay: vi.fn(),
    prepareRecording: vi.fn(),
    startPreparedRecording: vi.fn(),
    stopNativeRecording: vi.fn(),
    completeNativeRecording: vi.fn(),
    cancelPreparedRecording: vi.fn(),
    discardRecording: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setTeleprompterSession: vi.fn(),
    showScreenRegionOverlay: vi.fn(),
  },
  cameraApi: { request: vi.fn(), list: vi.fn() },
  microphoneApi: { request: vi.fn(), list: vi.fn() },
  systemApi: { request: vi.fn() },
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../../api/camera-recorder', () => ({
  BrowserCameraRecorder: { request: cameraApi.request },
  listBrowserCameras: cameraApi.list,
  isCameraUnavailableError: (reason: unknown) => (reason as { code?: string })?.code === 'camera-unavailable',
}));
vi.mock('../../../api/microphone-recorder', () => ({
  BrowserMicrophoneRecorder: { request: microphoneApi.request },
  listBrowserMicrophones: microphoneApi.list,
}));
vi.mock('../../../api/system-audio-recorder', () => ({
  BrowserSystemAudioRecorder: { request: systemApi.request },
}));

const configuration = (overrides: Partial<RecordingConfiguration> = {}): RecordingConfiguration => ({
  screenKind: 'display',
  screenId: 'display:1',
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  targetFps: 60,
  countdownSeconds: 0,
  recordingBarVisibility: 'always',
  ...overrides,
});

const recorder = () => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

let camera: ReturnType<typeof recorder>;
let microphone: ReturnType<typeof recorder>;
let systemAudio: ReturnType<typeof recorder>;

beforeEach(() => {
  vi.useFakeTimers();
  camera = recorder();
  microphone = recorder();
  systemAudio = recorder();
  vi.clearAllMocks();
  capture.getCameraOverlayState.mockResolvedValue({
    shadowSize: 'md',
    cornerRadius: 'lg',
    placement: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  });
  capture.prepareRecording.mockResolvedValue(undefined);
  capture.startPreparedRecording.mockResolvedValue({
    state: 'recording',
    sessionId: 'session-1',
    projectId: 'project-1',
  });
  capture.stopNativeRecording.mockResolvedValue({
    state: 'completed',
    sessionId: 'session-1',
  });
  capture.completeNativeRecording.mockResolvedValue({
    state: 'completed',
    sessionId: 'session-1',
  });
  capture.cancelPreparedRecording.mockResolvedValue(undefined);
  capture.discardRecording.mockResolvedValue(undefined);
  capture.stop.mockResolvedValue({
    state: 'completed',
    sessionId: 'session-1',
  });
  capture.pause.mockResolvedValue(undefined);
  capture.resume.mockResolvedValue(undefined);
  cameraApi.request.mockResolvedValue(camera);
  microphoneApi.request.mockResolvedValue(microphone);
  systemApi.request.mockResolvedValue(systemAudio);
  cameraApi.list.mockResolvedValue([
    { id: 'camera:one', isDefault: true },
    { id: 'camera:chromium:', isDefault: false },
  ]);
  microphoneApi.list.mockResolvedValue([
    { id: 'microphone:one', isDefault: true },
    { id: 'microphone:chromium:', isDefault: false },
  ]);
});

afterEach(() => vi.useRealTimers());

describe('useRecordingController branch behavior', () => {
  it('starts sidecars, tracks elapsed time, pauses/resumes, and completes', async () => {
    const complete = vi.fn();
    const controller = useRecordingController(complete);
    await controller.start(
      configuration({
        cameraId: 'camera:one',
        microphoneId: 'microphone:one',
        systemAudio: true,
        region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
        regionOverlay: { bounds: { x: 10, y: 20, width: 100, height: 80 } },
      }),
    );

    expect(controller.phase.value).toBe('recording');
    expect(controller.cameraEnabled.value).toBe(true);
    expect(controller.microphoneEnabled.value).toBe(true);
    expect(controller.systemAudioEnabled.value).toBe(true);
    expect(capture.showScreenRegionOverlay).toHaveBeenCalled();
    expect(capture.setTeleprompterSession).toHaveBeenCalledWith({
      projectId: 'project-1',
      sessionId: 'session-1',
    });
    await vi.advanceTimersByTimeAsync(350);
    expect(controller.recordingTime.value).toBe('00:00.3');

    await controller.togglePause();
    expect(controller.phase.value).toBe('paused');
    expect(capture.pause).toHaveBeenCalled();
    expect(camera.pause).toHaveBeenCalled();
    expect(microphone.pause).toHaveBeenCalled();
    expect(systemAudio.pause).toHaveBeenCalled();
    await controller.togglePause();
    expect(controller.phase.value).toBe('recording');
    expect(capture.resume).toHaveBeenCalled();
    expect(camera.resume).toHaveBeenCalledWith('session-1');
    expect(microphone.resume).toHaveBeenCalledWith('session-1');
    expect(systemAudio.resume).toHaveBeenCalledWith('session-1');

    await controller.stop();
    expect(capture.stopNativeRecording).toHaveBeenCalled();
    expect(camera.stop).toHaveBeenCalledWith(expect.any(Number));
    expect(microphone.stop).toHaveBeenCalledWith(expect.any(Number));
    expect(systemAudio.stop).toHaveBeenCalledWith(expect.any(Number));
    expect(capture.completeNativeRecording).toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1' }));
    expect(controller.phase.value).toBe('idle');
  });

  it('starts the sidecar timeline after delayed native startup', async () => {
    capture.startPreparedRecording.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                state: 'recording',
                sessionId: 'session-1',
                projectId: 'project-1',
              }),
            2_000,
          );
        }),
    );
    const controller = useRecordingController(vi.fn());
    const starting = controller.start(configuration({ cameraId: 'camera:one' }));

    await vi.advanceTimersByTimeAsync(2_000);
    await starting;
    await vi.advanceTimersByTimeAsync(500);
    await controller.stop();

    expect(camera.stop).toHaveBeenCalledOnce();
    expect(camera.stop.mock.calls[0][0]).toBeCloseTo(500_000_000, -7);
  });

  it('arms the native session before the countdown and hides the overlay at zero', async () => {
    const controller = useRecordingController(vi.fn());
    await controller.start(configuration({ countdownSeconds: 2 }));
    expect(controller.phase.value).toBe('countdown');
    expect(controller.secondsRemaining.value).toBe(2);
    expect(capture.setCountdown).toHaveBeenCalledWith(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.secondsRemaining.value).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.phase.value).toBe('recording');
    expect(capture.setCountdown).toHaveBeenLastCalledWith(null);
    expect(capture.prepareRecordingSurface).toHaveBeenCalledOnce();
    expect(capture.prepareRecordingSurface.mock.invocationCallOrder[0]).toBeLessThan(
      capture.startPreparedRecording.mock.invocationCallOrder[0],
    );
  });

  it('does not begin the visible countdown until native preparation is ready', async () => {
    const prepared = deferred<void>();
    capture.prepareRecording.mockReturnValueOnce(prepared.promise);
    const controller = useRecordingController(vi.fn());
    const starting = controller.start(configuration({ countdownSeconds: 2 }));

    await vi.advanceTimersByTimeAsync(0);
    expect(controller.phase.value).toBe('countdown');
    expect(capture.setCountdown).not.toHaveBeenCalled();

    prepared.resolve();
    await starting;
    expect(capture.setCountdown).toHaveBeenCalledWith(2);
  });

  it('downgrades unavailable cameras and cleans up toggle failures', async () => {
    cameraApi.request.mockRejectedValueOnce({ code: 'camera-unavailable' });
    const controller = useRecordingController(vi.fn());
    await controller.start(configuration({ cameraId: 'camera:missing' }));
    expect(controller.cameraEnabled.value).toBe(false);
    expect(controller.error.value).toContain('unavailable');

    await controller.cancel();
    const active = useRecordingController(vi.fn());
    await active.start(configuration());
    cameraApi.request.mockResolvedValueOnce(camera);
    await active.toggleCamera();
    expect(active.cameraEnabled.value).toBe(true);
    await active.toggleCamera();
    expect(active.cameraEnabled.value).toBe(false);

    const noCamera = useRecordingController(vi.fn());
    await noCamera.start(configuration());
    cameraApi.list.mockResolvedValueOnce([]);
    await noCamera.toggleCamera();
    expect(noCamera.error.value).toContain('No camera');
    microphoneApi.list.mockResolvedValueOnce([]);
    await active.toggleMicrophone();
    expect(active.error.value).toContain('No microphone');
    systemApi.request.mockRejectedValueOnce(new Error('system denied'));
    await active.toggleSystemAudio();
    expect(active.error.value).toBe('system denied');
  });

  it('reports stop and preparation failures while preserving a recording phase', async () => {
    const controller = useRecordingController(vi.fn());
    await controller.start(configuration());
    capture.stopNativeRecording.mockRejectedValueOnce(new Error('stop failed'));
    await controller.stop();
    expect(controller.phase.value).toBe('recording');
    expect(controller.error.value).toBe('stop failed');

    const failed = useRecordingController(vi.fn());
    cameraApi.request.mockRejectedValueOnce(new Error('camera setup failed'));
    await failed.start(configuration({ cameraId: 'camera:broken' }));
    expect(failed.phase.value).toBe('idle');
    expect(failed.error.value).toBe('camera setup failed');
  });

  it('is inert when no session is active and ignores duplicate starts', async () => {
    const controller = useRecordingController(vi.fn());
    await controller.stop();
    await controller.cancel();
    await controller.togglePause();
    await controller.toggleCamera();
    await controller.toggleMicrophone();
    await controller.toggleSystemAudio();
    await controller.start(configuration());
    const calls = capture.prepareRecording.mock.calls.length;
    await controller.start(configuration());
    expect(capture.prepareRecording).toHaveBeenCalledTimes(calls);
  });
});
