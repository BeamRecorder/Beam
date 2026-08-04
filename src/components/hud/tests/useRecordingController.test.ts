import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({
  getCameraOverlayState: vi.fn().mockResolvedValue(null),
  setCountdown: vi.fn(),
  hideScreenRegionOverlay: vi.fn(),
  prepareRecording: vi.fn().mockResolvedValue({ state: "armed" }),
  startPreparedRecording: vi.fn(),
  stopNativeRecording: vi.fn().mockResolvedValue({ state: "completed" }),
  completeNativeRecording: vi.fn().mockResolvedValue({ state: "completed" }),
  cancelPreparedRecording: vi.fn().mockResolvedValue(undefined),
  discardRecording: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue({ state: "completed" }),
  pause: vi.fn(),
  resume: vi.fn(),
  setTeleprompterSession: vi.fn(),
}));

vi.mock("../../../api/capture", () => ({ capture }));
vi.mock("../../../api/camera-recorder", () => ({
  BrowserCameraRecorder: { request: vi.fn() },
  isCameraUnavailableError: vi.fn().mockReturnValue(false),
  listBrowserCameras: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../../api/microphone-recorder", () => ({
  BrowserMicrophoneRecorder: { request: vi.fn() },
  listBrowserMicrophones: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../../api/system-audio-recorder", () => ({
  BrowserSystemAudioRecorder: { request: vi.fn() },
}));

import { useRecordingController } from "../recorder/useRecordingController";
import type { RecordingConfiguration } from "../recorder/recording-types";

const configuration = (countdownSeconds: number): RecordingConfiguration => ({
  screenKind: "display",
  screenId: "display:1",
  cameraId: "off",
  microphoneId: "no-audio",
  systemAudio: false,
  targetFps: 60,
  countdownSeconds,
  recordingBarVisibility: "always",
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

describe("useRecordingController cancellation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(capture).forEach((mock) => mock.mockClear());
    capture.getCameraOverlayState.mockResolvedValue(null);
    capture.stop.mockResolvedValue({ state: "completed" });
  });

  afterEach(() => vi.useRealTimers());

  it("stops a native session that resolves after Stop during the countdown", async () => {
    const started = deferred<{ state: string; sessionId: string }>();
    capture.startPreparedRecording.mockReturnValue(started.promise);
    const controller = useRecordingController(vi.fn());
    await controller.start(configuration(1));
    await vi.advanceTimersByTimeAsync(1_000);
    const cancellation = controller.cancel();
    started.resolve({ state: "recording", sessionId: "session-1" });
    await cancellation;
    expect(capture.stop).toHaveBeenCalledOnce();
    expect(controller.phase.value).toBe("idle");
  });

  it("also cancels an immediate native start before it can become recording", async () => {
    const started = deferred<{ state: string; sessionId: string }>();
    capture.startPreparedRecording.mockReturnValue(started.promise);
    const controller = useRecordingController(vi.fn());
    const starting = controller.start(configuration(0));
    await Promise.resolve();
    const cancellation = controller.cancel();
    started.resolve({ state: "recording", sessionId: "session-2" });
    await Promise.all([starting, cancellation]);
    expect(capture.stop).toHaveBeenCalledOnce();
    expect(controller.phase.value).toBe("idle");
  });

  it("starts only after the pre-warmed session is armed", async () => {
    const started = deferred<{ state: string; sessionId: string }>();
    capture.startPreparedRecording.mockReturnValue(started.promise);
    const controller = useRecordingController(vi.fn());
    const starting = controller.start(configuration(0));
    await vi.advanceTimersByTimeAsync(0);
    expect(capture.startPreparedRecording).toHaveBeenCalledOnce();
    started.resolve({ state: "recording", sessionId: "session-3" });
    await starting;
    expect(controller.phase.value).toBe("recording");
  });

  it("discards the native session when cancelling an active recording", async () => {
    capture.startPreparedRecording.mockResolvedValue({
      state: "recording",
      sessionId: "session-4",
    });
    const controller = useRecordingController(vi.fn());
    await controller.start(configuration(0));

    await controller.cancel();

    expect(capture.discardRecording).toHaveBeenCalledWith("session-4");
    expect(controller.phase.value).toBe("idle");
  });

  it("synchronizes the active project and session with the teleprompter window", async () => {
    const context = {
      projectId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
    };
    capture.startPreparedRecording.mockResolvedValue({
      state: "recording",
      ...context,
    });
    const controller = useRecordingController(vi.fn());
    await controller.start(configuration(0));
    expect(capture.setTeleprompterSession).toHaveBeenCalledWith(context);
    await controller.cancel();
  });
});
