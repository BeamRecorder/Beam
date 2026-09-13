import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserCameraRecorder, isCameraUnavailableError } from '../camera-recorder';

class FakeTrack {
  stopped = false;
  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((entry) => entry !== listener),
    );
  }

  getSettings() {
    return { width: 1280, height: 720, frameRate: 30 };
  }

  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  private readonly track: FakeTrack;

  constructor(track: FakeTrack) {
    this.track = track;
  }

  getVideoTracks() {
    return [this.track];
  }

  getTracks() {
    return [this.track];
  }
}

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  readonly stream: MediaStream;
  readonly options: MediaRecorderOptions;

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    super();
    this.stream = stream;
    this.options = options;
    FakeMediaRecorder.instances.push(this);
  }

  static isTypeSupported() {
    return true;
  }

  start() {}

  stop() {
    this.dispatchEvent(new Event('stop'));
  }

  data() {
    const event = new Event('dataavailable') as Event & { data: Blob };
    event.data = {
      size: 1,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    } as unknown as Blob;
    this.dispatchEvent(event);
  }
}

const capture = {
  beginCameraSegment: vi.fn().mockResolvedValue({ jobId: 'camera-job-1' }),
  writeCameraSegment: vi.fn().mockResolvedValue(undefined),
  finalizeCameraSegment: vi.fn().mockResolvedValue(undefined),
  failCamera: vi.fn().mockResolvedValue(undefined),
};

let track!: FakeTrack;
let previousMediaDevices: MediaDevices | undefined;
let previousCapture: typeof window.capture;

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  track = new FakeTrack();
  previousMediaDevices = navigator.mediaDevices;
  previousCapture = window.capture;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream(track)) },
  });
  window.capture = capture as unknown as typeof window.capture;
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  let frameCallbackCount = 0;
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    value: vi.fn((callback: VideoFrameRequestCallback) => {
      if (frameCallbackCount++ === 0) callback(0, { width: 1280, height: 720 } as VideoFrameCallbackMetadata);
      return frameCallbackCount;
    }),
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: previousMediaDevices });
  window.capture = previousCapture;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('camera recorder branch behavior', () => {
  it.each([
    [null, false],
    [{ name: 'NotFoundError' }, true],
    [{ name: 'NotReadableError' }, true],
    [{ name: 'OverconstrainedError' }, true],
    [new Error('Could not start video source'), true],
    [new Error('hardware resources are exhausted'), true],
    [new Error('unrelated failure'), false],
  ])('classifies camera availability failures: %s', (error, expected) => {
    expect(isCameraUnavailableError(error)).toBe(expected);
  });

  it('reports non-Error chunk failures through the fatal handler', async () => {
    const recorder = await BrowserCameraRecorder.request('camera:chromium:camera-1');
    const fatal = vi.fn();
    recorder.onFatal(fatal);
    await recorder.start('session-1');
    capture.writeCameraSegment.mockRejectedValueOnce('write failed');
    FakeMediaRecorder.instances[0].data();

    await expect(recorder.stop()).rejects.toThrow('write failed');
    expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ message: 'write failed' }));
    expect(track.stopped).toBe(true);
  });
});
