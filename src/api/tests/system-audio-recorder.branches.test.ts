import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSystemAudioRecorder, recordSystemAudioFailure } from '../system-audio-recorder';

class FakeTrack extends EventTarget {
  stopped = false;

  getSettings() {
    return { sampleRate: 48_000, channelCount: 2 };
  }

  stop = vi.fn(() => {
    this.stopped = true;
  });
}

class FakeStream {
  private readonly tracks: FakeTrack[];

  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks;
  }

  getAudioTracks() {
    return this.tracks;
  }

  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  static supported = true;
  state = 'inactive';
  readonly stream: MediaStream;
  readonly options: MediaRecorderOptions;

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    super();
    this.stream = stream;
    this.options = options;
    FakeMediaRecorder.instances.push(this);
  }

  static isTypeSupported() {
    return FakeMediaRecorder.supported;
  }

  start = vi.fn(() => {
    this.state = 'recording';
  });

  stop = vi.fn(() => {
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  });

  data(data = new Uint8Array([1, 2, 3])) {
    const event = new Event('dataavailable') as Event & { data: Blob };
    event.data = {
      size: data.byteLength,
      arrayBuffer: () => Promise.resolve(data.buffer),
    } as unknown as Blob;
    this.dispatchEvent(event);
  }

  error() {
    this.dispatchEvent(new Event('error'));
  }
}

const capture = {
  beginSystemAudioSegment: vi.fn(),
  writeSystemAudioSegment: vi.fn(),
  finalizeSystemAudioSegment: vi.fn(),
  failSystemAudio: vi.fn(),
};

const getDisplayMedia = vi.fn();
let audioTrack!: FakeTrack;
let videoTrack!: FakeTrack;
let display!: MediaStream;
let previousMediaDevices: MediaDevices | undefined;
let previousCapture: typeof window.capture;

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = true;
  audioTrack = new FakeTrack();
  videoTrack = new FakeTrack();
  display = {
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
    getTracks: () => [audioTrack, videoTrack],
  } as unknown as MediaStream;
  getDisplayMedia.mockResolvedValue(display);
  capture.beginSystemAudioSegment.mockResolvedValue({ jobId: 'system-job-1' });
  capture.writeSystemAudioSegment.mockResolvedValue(undefined);
  capture.finalizeSystemAudioSegment.mockResolvedValue(undefined);
  capture.failSystemAudio.mockResolvedValue(undefined);
  previousMediaDevices = navigator.mediaDevices;
  previousCapture = window.capture;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia },
  });
  window.capture = capture as unknown as typeof window.capture;
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('MediaStream', FakeStream);
});

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: previousMediaDevices });
  window.capture = previousCapture;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BrowserSystemAudioRecorder', () => {
  it('requests loopback audio, discards video, writes chunks, and finalizes', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(12);
    const recorder = await BrowserSystemAudioRecorder.request();

    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(videoTrack.stop).toHaveBeenCalledOnce();
    expect(recorder.sourceId).toBe('system-audio:chromium:desktop-loopback');
    expect(recorder.format).toEqual({ codec: 'opus', sampleRate: 48_000, channels: 2 });

    await recorder.start('session-1');
    const mediaRecorder = FakeMediaRecorder.instances[0];
    expect(capture.beginSystemAudioSegment).toHaveBeenCalledWith({
      sessionId: 'session-1',
      sourceId: 'system-audio:chromium:desktop-loopback',
      format: { codec: 'opus', sampleRate: 48_000, channels: 2 },
      startNs: 0,
    });
    expect(mediaRecorder.start).toHaveBeenCalledWith(1000);

    mediaRecorder.data(new Uint8Array([4, 5]));
    mediaRecorder.data(new Uint8Array());
    await recorder.stop();

    expect(capture.writeSystemAudioSegment).toHaveBeenCalledWith({
      jobId: 'system-job-1',
      sequence: 0,
      data: new Uint8Array([4, 5]),
    });
    expect(capture.finalizeSystemAudioSegment).toHaveBeenCalledWith({
      jobId: 'system-job-1',
      endNs: 0,
      metrics: {},
    });
    expect(audioTrack.stop).toHaveBeenCalledOnce();
    expect(now).toHaveBeenCalled();
  });

  it('reports track and encoder failures, then ignores them after release', async () => {
    const recorder = await BrowserSystemAudioRecorder.request();
    const fatal = vi.fn();
    recorder.onFatal(fatal);
    await recorder.start('session-2');

    FakeMediaRecorder.instances[0].error();
    audioTrack.dispatchEvent(new Event('ended'));
    expect(fatal).toHaveBeenCalledTimes(2);
    expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('encoding') }));
    expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('sharing') }));

    await recorder.stop();
    FakeMediaRecorder.instances[0].error();
    audioTrack.dispatchEvent(new Event('ended'));
    expect(fatal).toHaveBeenCalledTimes(2);
  });

  it('pauses and resumes as separate audio segments', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const recorder = await BrowserSystemAudioRecorder.request();
    await recorder.start('session-pause');
    await recorder.pause();
    await recorder.resume('session-pause');
    await recorder.stop();

    expect(capture.beginSystemAudioSegment).toHaveBeenCalledTimes(2);
    expect(capture.finalizeSystemAudioSegment).toHaveBeenCalledTimes(2);
    expect(FakeMediaRecorder.instances).toHaveLength(2);
  });

  it('converts rejected chunk values to Error and persists an explicit failure', async () => {
    const recorder = await BrowserSystemAudioRecorder.request();
    const fatal = vi.fn();
    recorder.onFatal(fatal);
    await recorder.start('session-3');
    capture.writeSystemAudioSegment.mockRejectedValueOnce('write failed');

    FakeMediaRecorder.instances[0].data(new Uint8Array([8]));
    await recorder.fail('session-3', 'encoder failed');

    expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ message: 'write failed' }));
    expect(capture.failSystemAudio).toHaveBeenCalledWith({
      sessionId: 'session-3',
      sourceId: 'system-audio:chromium:desktop-loopback',
      format: { codec: 'opus', sampleRate: 48_000, channels: 2 },
      reason: 'encoder failed',
    });
    expect(audioTrack.stop).toHaveBeenCalledOnce();
  });

  it('persists failure when finalization itself fails', async () => {
    const recorder = await BrowserSystemAudioRecorder.request();
    await recorder.start('session-4');
    capture.finalizeSystemAudioSegment.mockRejectedValueOnce(new Error('disk full'));

    await expect(recorder.stop()).rejects.toThrow('disk full');
    await recorder.fail('session-4', 'storage failed');

    expect(capture.failSystemAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-4',
        reason: 'storage failed',
      }),
    );
    expect(audioTrack.stop).toHaveBeenCalledOnce();
  });

  it('rejects unsupported capture setups and stops every track without audio', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await expect(BrowserSystemAudioRecorder.request()).rejects.toThrow('unavailable in this Chromium build');

    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
    FakeMediaRecorder.supported = false;
    await expect(BrowserSystemAudioRecorder.request()).rejects.toThrow('cannot record Opus');

    FakeMediaRecorder.supported = true;
    const videoOnly = new FakeTrack();
    getDisplayMedia.mockResolvedValueOnce({
      getAudioTracks: () => [],
      getVideoTracks: () => [videoOnly],
      getTracks: () => [videoOnly],
    });
    await expect(BrowserSystemAudioRecorder.request()).rejects.toThrow('did not provide system audio');
    expect(videoOnly.stop).toHaveBeenCalledTimes(2);
  });

  it('rejects operations outside Electron and records standalone failures', async () => {
    const recorder = await BrowserSystemAudioRecorder.request();
    delete window.capture;
    await expect(recorder.start('session-5')).rejects.toThrow('unavailable outside Electron');
    await recorder.stop();

    await expect(recordSystemAudioFailure('session-6', 'permission denied')).rejects.toThrow(
      'unavailable outside Electron',
    );
  });
});
