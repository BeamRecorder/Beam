import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingConfiguration } from './recording-types';

const mocks = vi.hoisted(() => {
  const makeRecorder = () => ({
    onFatal: vi.fn(),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
  });
  return {
    cameraRecorder: makeRecorder(),
    micRecorder: makeRecorder(),
    systemAudioRecorder: makeRecorder(),
    systemAudioRequest: vi.fn(async () => mocks.systemAudioRecorder),
    capture: {
      platform: 'darwin',
      getCameraOverlayState: vi.fn(async () => null),
      prepareRecording: vi.fn(async () => ({ sessionId: 'prepared' })),
      cancelPreparedRecording: vi.fn(async () => undefined),
      setCountdown: vi.fn(async () => undefined),
      prepareRecordingSurface: vi.fn(async () => undefined),
      startPreparedRecording: vi.fn(async (): Promise<{ sessionId?: string; projectId?: string }> => ({
        sessionId: 'session-1',
      })),
      discardRecording: vi.fn(async (): Promise<void> => undefined),
      stop: vi.fn(async () => ({ sessionId: 'session-1' })),
      stopNativeRecording: vi.fn(async () => ({ sessionId: 'session-1' })),
      completeNativeRecording: vi.fn(async () => ({ sessionId: 'session-1', videoSrc: 'file:///v.mp4' })),
      status: vi.fn(async () => ({ state: 'recording', screenAvailable: true })),
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
  BrowserSystemAudioRecorder: { request: mocks.systemAudioRequest },
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
  mocks.capture.platform = 'darwin';
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
  it('clamps a negative countdown and starts native capture exactly once', async () => {
    vi.useFakeTimers();
    const controller = useRecordingController(vi.fn(), vi.fn());

    await controller.start({ ...baseConfig, countdownSeconds: -10 });
    expect(controller.phase.value).toBe('starting');
    expect(controller.secondsRemaining.value).toBe(0);

    await vi.waitFor(() => expect(mocks.capture.startPreparedRecording).toHaveBeenCalledTimes(1));
    expect(controller.phase.value).toBe('recording');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.capture.startPreparedRecording).toHaveBeenCalledTimes(1);
    expect(controller.secondsRemaining.value).toBe(0);
  });

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
    expect(mocks.capture.discardRecording).toHaveBeenCalledWith(undefined);
    expect(mocks.capture.cancelPreparedRecording).not.toHaveBeenCalled();
  });

  it('discards a prepared session after native start fails and allows an immediate retry', async () => {
    vi.useFakeTimers();
    mocks.capture.startPreparedRecording
      .mockRejectedValueOnce(new Error('native start failed'))
      .mockResolvedValueOnce({ sessionId: 'retry-session' });
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);

    await controller.start({ ...baseConfig, countdownSeconds: 1 });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));

    expect(controller.phase.value).toBe('idle');
    expect(mocks.capture.discardRecording).toHaveBeenCalledWith(undefined);
    expect(mocks.capture.cancelPreparedRecording).not.toHaveBeenCalled();
    expect(mocks.capture.prepareRecording.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capture.startPreparedRecording.mock.invocationCallOrder[0],
    );

    await controller.start(baseConfig);
    await vi.waitFor(() => expect(controller.phase.value).toBe('recording'));
    expect(mocks.capture.prepareRecording).toHaveBeenCalledTimes(2);
    expect(mocks.capture.startPreparedRecording).toHaveBeenCalledTimes(2);
  });

  it('blocks retries when prepared-session discard fails', async () => {
    vi.useFakeTimers();
    mocks.capture.startPreparedRecording.mockRejectedValueOnce(new Error('native start failed'));
    mocks.capture.discardRecording.mockRejectedValueOnce(new Error('discard failed'));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);

    await controller.start({ ...baseConfig, countdownSeconds: 1 });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));

    expect(controller.phase.value).toBe('idle');
    expect(controller.error.value).toContain('restart Beam');
    const prepareCalls = mocks.capture.prepareRecording.mock.calls.length;
    await controller.start(baseConfig);
    expect(mocks.capture.prepareRecording).toHaveBeenCalledTimes(prepareCalls);
    expect(mocks.capture.startPreparedRecording).toHaveBeenCalledTimes(1);
  });

  it('cleans up a native session when startup returns without a session id', async () => {
    mocks.capture.startPreparedRecording.mockResolvedValueOnce({} as { sessionId?: string });
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);

    await controller.start(baseConfig);
    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));

    expect(onStartupFailure.mock.calls[0][0]).toMatchObject({
      stage: 'start-native',
      nativeStarted: true,
    });
    expect(mocks.capture.discardRecording).toHaveBeenCalledWith(undefined);
    expect(controller.phase.value).toBe('idle');
  });
});

describe('useRecordingController startup', () => {
  it('uses native Linux system audio during prepare and start without Chromium capture', async () => {
    mocks.capture.platform = 'linux';
    const controller = useRecordingController(vi.fn());

    await controller.start({ ...baseConfig, systemAudio: true });
    await vi.waitFor(() => expect(controller.phase.value).toBe('recording'));

    expect(mocks.capture.prepareRecording).toHaveBeenCalledWith(expect.objectContaining({ systemAudio: true }));
    expect(controller.systemAudioEnabled.value).toBe(true);
    expect(mocks.systemAudioRequest).not.toHaveBeenCalled();
  });

  it('keeps native Linux system audio in prepared state when native start fails', async () => {
    mocks.capture.platform = 'linux';
    mocks.capture.startPreparedRecording.mockRejectedValueOnce(new Error('native start failed'));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);

    await controller.start({ ...baseConfig, systemAudio: true });
    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));

    expect(onStartupFailure.mock.calls[0][0]).toMatchObject({
      stage: 'start-native',
      systemAudio: 'prepared',
    });
    expect(mocks.systemAudioRequest).not.toHaveBeenCalled();
  });

  it('marks native Linux system audio started after native start succeeds', async () => {
    mocks.capture.platform = 'linux';
    mocks.cameraRecorder.start.mockRejectedValueOnce(new Error('camera start failed'));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);

    await controller.start({
      ...fullConfig,
      microphoneId: 'no-audio',
    });
    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));

    expect(onStartupFailure.mock.calls[0][0]).toMatchObject({
      stage: 'start-sidecars',
      nativeStarted: true,
      camera: 'failed',
      systemAudio: 'started',
    });
    expect(mocks.systemAudioRequest).not.toHaveBeenCalled();
  });

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

    // The blocked start eventually resolves and must clean up the native session
    // explicitly, without resurrecting the recording.
    resolveStart({ sessionId: 'session-1' });
    await vi.waitFor(() => expect(mocks.capture.discardRecording).toHaveBeenCalledWith('session-1'));
    expect(mocks.capture.stop).not.toHaveBeenCalled();
    expect(controller.phase.value).toBe('idle');
  });

  it('cancels the prepared session when a stale native start rejects', async () => {
    let rejectStart: (reason: Error) => void = () => undefined;
    mocks.capture.startPreparedRecording.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectStart = reject;
      }),
    );
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start({ ...baseConfig, countdownSeconds: 0 });
    expect(controller.phase.value).toBe('starting');

    await controller.cancel();
    expect(controller.phase.value).toBe('idle');

    // resetState deferred prepared-session cleanup to the stale-generation path;
    // a rejecting start must still release the prepared native session.
    rejectStart(new Error('native start failed'));
    await vi.waitFor(() => expect(mocks.capture.cancelPreparedRecording).toHaveBeenCalled());
    expect(mocks.capture.discardRecording).not.toHaveBeenCalled();
    expect(controller.phase.value).toBe('idle');
  });

  it('cancels the prepared session when a stale surface preparation rejects', async () => {
    let rejectSurface: (reason: Error) => void = () => undefined;
    mocks.capture.prepareRecordingSurface.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSurface = reject;
      }),
    );
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start({ ...baseConfig, countdownSeconds: 0 });
    expect(controller.phase.value).toBe('starting');

    await controller.cancel();
    expect(controller.phase.value).toBe('idle');

    rejectSurface(new Error('surface preparation failed'));
    await vi.waitFor(() => expect(mocks.capture.cancelPreparedRecording).toHaveBeenCalled());
    expect(mocks.capture.startPreparedRecording).not.toHaveBeenCalled();
    expect(controller.phase.value).toBe('idle');
  });

  it('keeps a new start blocked until deferred stale-session cleanup completes', async () => {
    let resolveStart: (value: { sessionId: string }) => void = () => undefined;
    let resolveDiscard: () => void = () => undefined;
    mocks.capture.startPreparedRecording.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    mocks.capture.discardRecording.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDiscard = resolve;
      }),
    );
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start({ ...baseConfig, countdownSeconds: 0 });
    await controller.cancel();

    resolveStart({ sessionId: 'stale-session' });
    await vi.waitFor(() => expect(mocks.capture.discardRecording).toHaveBeenCalledWith('stale-session'));

    const prepareCallsBeforeRetry = mocks.capture.prepareRecording.mock.calls.length;
    await controller.start({ ...baseConfig, countdownSeconds: 0 });
    expect(mocks.capture.prepareRecording).toHaveBeenCalledTimes(prepareCallsBeforeRetry);

    resolveDiscard();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await controller.start({ ...baseConfig, countdownSeconds: 0 });
    await vi.waitFor(() => expect(mocks.capture.prepareRecording).toHaveBeenCalledTimes(prepareCallsBeforeRetry + 1));
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

  it.each([
    ['camera', () => mocks.cameraRecorder],
    ['microphone', () => mocks.micRecorder],
    ['systemAudio', () => mocks.systemAudioRecorder],
  ] as const)('reports %s startup failure after native start', async (kind, recorder) => {
    recorder().start.mockRejectedValueOnce(new Error(`${kind} start failed`));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);
    await controller.start(fullConfig);

    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));
    expect(onStartupFailure.mock.calls[0][0]).toMatchObject({
      stage: 'start-sidecars',
      nativeStarted: true,
      [kind]: 'failed',
    });
    expect(controller.phase.value).toBe('idle');
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
    const prepareCalls = mocks.capture.prepareRecording.mock.calls.length;
    await controller.start(fullConfig);
    expect(mocks.capture.prepareRecording).toHaveBeenCalledTimes(prepareCalls);
    expect(controller.error.value).toContain('restart Beam');
  });

  it('preserves sidecar cleanup errors in startup failure metadata', async () => {
    mocks.systemAudioRecorder.start.mockRejectedValue(new Error('system audio failed'));
    mocks.cameraRecorder.stop.mockRejectedValueOnce(new Error('camera cleanup failed'));
    const onStartupFailure = vi.fn();
    const controller = useRecordingController(vi.fn(), onStartupFailure);
    await controller.start(fullConfig);

    await vi.waitFor(() => expect(onStartupFailure).toHaveBeenCalledTimes(1));
    expect(onStartupFailure.mock.calls[0][0].cleanupErrors).toContain('camera cleanup failed');
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
    await vi.waitFor(() => expect(mocks.capture.discardRecording).toHaveBeenCalledWith('session-1'));
    expect(mocks.capture.stop).not.toHaveBeenCalled();
    expect(controller.phase.value).toBe('idle');
  });

  it('starts the timer only after native and sidecars have started', async () => {
    const controller = useRecordingController(vi.fn(), vi.fn());
    await controller.start(fullConfig);
    await vi.waitFor(() => expect(controller.phase.value).toBe('recording'));
    expect(controller.recordingTime.value).toBe('00:00.0');
  });
});
