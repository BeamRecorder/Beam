import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserMicrophoneSource } from './browser-microphone-source';
import { ProjectVoiceoverRecorder } from './project-voiceover-recorder';

const mocks = vi.hoisted(() => ({
  capture: {
    beginProjectVoiceover: vi.fn(),
    writeProjectVoiceoverChunk: vi.fn(),
    finalizeProjectVoiceover: vi.fn(),
    abortProjectVoiceover: vi.fn(),
  },
  requestBrowserMicrophoneSource: vi.fn(),
}));

vi.mock('./capture', () => ({ capture: mocks.capture }));
vi.mock('./browser-microphone-source', () => ({
  MIME_TYPE: 'audio/webm;codecs=opus',
  requestBrowserMicrophoneSource: mocks.requestBrowserMicrophoneSource,
}));

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  static failConstructor = false;

  state: RecordingState = 'inactive';
  readonly stream: MediaStream;
  readonly options: MediaRecorderOptions;

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    super();
    this.stream = stream;
    this.options = options;
    if (FakeMediaRecorder.failConstructor) throw new Error('MediaRecorder construction failed.');
    FakeMediaRecorder.instances.push(this);
  }

  start = vi.fn((_timeslice?: number) => {
    this.state = 'recording';
  });

  pause = vi.fn(() => {
    this.state = 'paused';
  });

  resume = vi.fn(() => {
    this.state = 'recording';
  });

  stop = vi.fn(() => {
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  });

  emitChunk(data: readonly number[]) {
    const event = new Event('dataavailable') as Event & { data: Blob };
    const bytes = Uint8Array.from(data);
    event.data = {
      size: bytes.byteLength,
      arrayBuffer: vi.fn(async () => bytes.buffer),
    } as unknown as Blob;
    this.dispatchEvent(event);
  }
}

const createSource = (): BrowserMicrophoneSource => {
  const track = new EventTarget();
  return {
    sourceId: 'microphone:chromium:default',
    stream: {} as MediaStream,
    track: track as MediaStreamTrack,
    format: { codec: 'opus', sampleRate: 48_000, channels: 1 },
    sampleWaveform: vi.fn(() => new Float32Array()),
    fadeTo: vi.fn(),
    release: vi.fn(),
  } as unknown as BrowserMicrophoneSource;
};

let source: BrowserMicrophoneSource;

beforeEach(() => {
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.failConstructor = false;
  source = createSource();
  mocks.requestBrowserMicrophoneSource.mockResolvedValue(source);
  mocks.capture.beginProjectVoiceover.mockResolvedValue({ recordingId: 'voiceover-1' });
  mocks.capture.writeProjectVoiceoverChunk.mockResolvedValue(undefined);
  mocks.capture.finalizeProjectVoiceover.mockResolvedValue({
    id: 'voiceover-asset',
    kind: 'audio',
    name: 'Voice-over',
    src: 'project://voiceover-asset',
    origin: 'project',
  });
  mocks.capture.abortProjectVoiceover.mockResolvedValue(undefined);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ProjectVoiceoverRecorder', () => {
  it('writes non-empty chunks in sequence before finalizing the asset', async () => {
    const recorder = await ProjectVoiceoverRecorder.request(source.sourceId);
    await recorder.start('project-1');
    const mediaRecorder = FakeMediaRecorder.instances[0]!;

    mediaRecorder.emitChunk([1, 2]);
    mediaRecorder.emitChunk([3, 4]);
    mediaRecorder.emitChunk([]);
    const asset = await recorder.stop('Narration');

    expect(mocks.capture.writeProjectVoiceoverChunk).toHaveBeenCalledTimes(2);
    expect(mocks.capture.writeProjectVoiceoverChunk).toHaveBeenNthCalledWith(1, {
      recordingId: 'voiceover-1',
      sequence: 0,
      data: new Uint8Array([1, 2]),
    });
    expect(mocks.capture.writeProjectVoiceoverChunk).toHaveBeenNthCalledWith(2, {
      recordingId: 'voiceover-1',
      sequence: 1,
      data: new Uint8Array([3, 4]),
    });
    expect(mocks.capture.finalizeProjectVoiceover).toHaveBeenCalledWith({
      recordingId: 'voiceover-1',
      name: 'Narration',
    });
    expect(asset.id).toBe('voiceover-asset');
  });

  it('pauses and resumes the active MediaRecorder', async () => {
    const recorder = await ProjectVoiceoverRecorder.request(source.sourceId);
    await recorder.start('project-1');
    const mediaRecorder = FakeMediaRecorder.instances[0]!;

    recorder.pause();
    recorder.pause();
    recorder.resume();
    recorder.resume();

    expect(mediaRecorder.pause).toHaveBeenCalledOnce();
    expect(mediaRecorder.resume).toHaveBeenCalledOnce();
    expect(mediaRecorder.state).toBe('recording');
    await recorder.discard();
  });

  it('aborts the opened recording when MediaRecorder construction fails', async () => {
    FakeMediaRecorder.failConstructor = true;
    const recorder = await ProjectVoiceoverRecorder.request(source.sourceId);

    await expect(recorder.start('project-1')).rejects.toThrow('MediaRecorder construction failed.');

    expect(mocks.capture.beginProjectVoiceover).toHaveBeenCalledWith({
      projectId: 'project-1',
      sourceId: source.sourceId,
      format: source.format,
    });
    expect(mocks.capture.abortProjectVoiceover).toHaveBeenCalledWith('voiceover-1');
    expect(source.release).not.toHaveBeenCalled();
  });

  it('waits for pending chunk writes before aborting on discard', async () => {
    let resolveWrite!: () => void;
    const writeFinished = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    let resolveWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      resolveWriteStarted = resolve;
    });
    mocks.capture.writeProjectVoiceoverChunk.mockImplementationOnce(async () => {
      resolveWriteStarted();
      await writeFinished;
    });

    const recorder = await ProjectVoiceoverRecorder.request(source.sourceId);
    await recorder.start('project-1');
    FakeMediaRecorder.instances[0]!.emitChunk([9]);
    await writeStarted;

    const discard = recorder.discard();
    await Promise.resolve();
    expect(mocks.capture.abortProjectVoiceover).not.toHaveBeenCalled();

    resolveWrite();
    await discard;

    expect(mocks.capture.abortProjectVoiceover).toHaveBeenCalledWith('voiceover-1');
    expect(source.release).toHaveBeenCalledOnce();
  });
});
