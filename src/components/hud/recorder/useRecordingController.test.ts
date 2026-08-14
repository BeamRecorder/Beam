import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingConfiguration } from './recording-types';

const mocks = vi.hoisted(() => {
  const makeRecorder = () => ({
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
  });
  return {
    cameraRecorder: makeRecorder(),
    micRecorder: makeRecorder(),
    systemAudioRecorder: makeRecorder(),
    capture: {
      getCameraOverlayState: vi.fn(async () => null),
      prepareRecording: vi.fn(async () => ({ sessionId: 'prepared' })),
      cancelPreparedRecording: vi.fn(async () => undefined),
      setCountdown: vi.fn(async () => undefined),
      prepareRecordingSurface: vi.fn(async () => undefined),
      startPreparedRecording: vi.fn(async () => ({ sessionId: 'session-1' })),
      discardRecording: vi.fn(async () => undefined),
      stop: vi.fn(async () => ({ sessionId: 'session-1' })),
      stopNativeRecording: vi.fn(async () => ({ sessionId: 'session-1' })),
      completeNativeRecording: vi.fn(async () => ({ sessionId: 'session-1', videoSrc: 'file:///v.mp4' })),
      pause: vi.fn(async () => ({ sessionId: 'session-1' })),
      resume: vi.fn(async () => ({ sessionId: 'session-1' })),
      setTeleprompterSession: vi.fn(),
      showScreenRegionOverlay: vi.fn(),
      hideScreenRegionOverlay: vi.fn(),
    },
  };
});

vi.mock('../../../api/capture', () => ({ capture: mocks.capture }));
vi.mock('../../../api/camera-recorder', () => ({
  BrowserCameraRecorder: { request: vi.fn(async () => mocks.cameraRecorder) },
  isCameraUnavailableError: (error: unknown) => (error as Error)?.name === 'NotFoundError',
  listBrowserCameras: vi.fn(async () => []),
}));
vi.mock('../../../api/microphone-recorder', () => ({
  BrowserMicrophoneRecorder: { request: vi.fn(async () => mocks.micRecorder) },
  listBrowserMicrophones: vi.fn(async () => []),
}));
vi.mock('../../../api/system-audio-recorder', () => ({
  BrowserSystemAudioRecorder: { request: vi.fn(async () => mocks.systemAudioRecorder) },
}));

import { useRecordingController } from './useRecordingController';

const baseConfig: RecordingConfiguration = {
  screenKind: 'display',
  screenId: 'screen-1',
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  targetFps: 60,
  countdownSeconds: 0,
  recordingBarVisibility: 'always',
};

const fullConfig: RecordingConfiguration = {
  ...baseConfig,
  cameraId: 'camera:chromium:1',
  microphoneId: 'microphone:chromium:1',
  systemAudio: true,
};

const resetCapture = () => {
  mocks.capture.getCameraOverlayState.mockResolvedValue(null);
  mocks.capture.prepareRecording.mockResolvedValue({ sessionId: 'prepared' });
  mocks.capture.cancelPreparedRecording.mockResolvedValue(undefined);
  mocks.capture.setCountdown.mockResolvedValue(undefined);
  mocks.capture.prepareRecordingSurface.mockResolvedValue(undefined);
  mocks.capture.startPreparedRecording.mockResolvedValue({ sessionId: 'session-1' });
  mocks.capture.discardRecording.mockResolvedValue(undefined);
  mocks.capture.stop.mockResolvedValue({ sessionId: 'session-1' });
  mocks.capture.stopNativeRecording.mockResolvedValue({ sessionId: 'session-1' });
  mocks.capture.completeNativeRecording.mockResolvedValue({ sessionId: 'session-1', videoSrc: 'file:///v.mp4' });
  mocks.capture.pause.mockResolvedValue({ sessionId: 'session-1' });
  mocks.capture.resume.mockResolvedValue({ sessionId: 'session-1' });
  for (const recorder of [mocks.cameraRecorder, mocks.micRecorder, mocks.systemAudioRecorder]) {
    recorder.start.mockResolvedValue(undefined);
    recorder.stop.mockResolvedValue(undefined);
    recorder.pause.mockResolvedValue(undefined);
    recorder.resume.mockResolvedValue(undefined);
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  resetCapture();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRecordingController countdown', () => {
  it('starts the native recorder exactly once when the countdown reaches zero', async () => {
    vi.useFakeTimers();
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start({ ...baseConfig, countdownSeconds: 1 });
    expect(controller.phase.value).toBe('countdown');
    expect(mocks.capture.startPreparedRecording).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.secondsRemaining.value).toBe(0);
    expect(controller.phase.value).toBe('recording');
    expect(mocks.capture.startPreparedRecording).toHaveBeenCalledTimes(1);
  });

  it('clamps the countdown and never triggers more than once when timers skip past zero', async () => {
    vi.useFakeTimers();
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start({ ...baseConfig, countdownSeconds: 1 });

    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.secondsRemaining.value).toBe(0);
    expect(controller.secondsRemaining.value).not.toBeLessThan(0);
    expect(mocks.capture.startPreparedRecording).toHaveBeenCalledTimes(1);
    expect(controller.phase.value).toBe('recording');
  });

  it('reports a start-native failure with correct metadata after the countdown', async () => {
    vi.useFakeTimers();
    mocks.capture.startPreparedRecording.mockRejectedValue(new Error('native start failed'));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);
    await controller.start({ ...baseConfig, countdownSeconds: 1 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.phase.value).toBe('idle');
    expect(onStartupFailure).toHaveBeenCalledTimes(1);
    expect(onStartupFailure.mock.calls[0][0]).toMatchObject({
      stage: 'start-native',
      message: 'native start failed',
      nativePrepared: true,
      nativeStarted: false,
      camera: 'disabled',
      microphone: 'disabled',
      systemAudio: 'disabled',
    });
    expect(mocks.capture.cancelPreparedRecording).toHaveBeenCalled();
  });
});

describe('useRecordingController startup', () => {
  it('cancels a pending native start without waiting for it to settle', async () => {
    let resolveStart: (value: { sessionId: string }) => void = () => undefined;
    mocks.capture.startPreparedRecording.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start({ ...baseConfig, countdownSeconds: 0 });
    expect(controller.phase.value).toBe('starting');

    await controller.cancel();
    expect(controller.phase.value).toBe('idle');
    expect(mocks.capture.cancelPreparedRecording).toHaveBeenCalled();

    // The blocked start eventually resolves and must not resurrect the recording.
    resolveStart({ sessionId: 'session-1' });
    await vi.waitFor(() => expect(controller.phase.value).toBe('idle'));
    expect(controller.phase.value).toBe('idle');
  });

  it('reports per-component state when a sidecar fails to start', async () => {
    mocks.systemAudioRecorder.start.mockRejectedValue(new Error('system audio failed'));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);
    await controller.start(fullConfig);

    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));
    expect(controller.phase.value).toBe('idle');
    expect(onStartupFailure.mock.calls[0][0]).toMatchObject({
      stage: 'start-sidecars',
      nativePrepared: false,
      nativeStarted: true,
      camera: 'started',
      microphone: 'started',
      systemAudio: 'failed',
    });
    expect(mocks.capture.discardRecording).toHaveBeenCalledWith('session-1');
  });

  it('records cleanup errors when discarding the started native session fails', async () => {
    mocks.systemAudioRecorder.start.mockRejectedValue(new Error('system audio failed'));
    mocks.capture.discardRecording.mockRejectedValue(new Error('discard failed'));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);
    await controller.start(fullConfig);

    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));
    const failure = onStartupFailure.mock.calls[0][0];
    expect(failure.cleanupErrors).toContain('discard failed');
  });

  it('never lets a stale async callback restore the recording phase after cleanup', async () => {
    let resolveStart: (value: { sessionId: string }) => void = () => undefined;
    mocks.capture.startPreparedRecording.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start({ ...baseConfig, countdownSeconds: 0 });
    await controller.cancel();
    expect(controller.phase.value).toBe('idle');

    resolveStart({ sessionId: 'session-1' });
    await vi.waitFor(() => expect(mocks.capture.stop).toHaveBeenCalled());
    expect(controller.phase.value).toBe('idle');
  });

  it('starts the timer only after native and sidecars have started', async () => {
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start(fullConfig);
    await vi.waitFor(() => expect(controller.phase.value).toBe('recording'));
    expect(controller.recordingTime.value).toBe('00:00.0');
  });
});
