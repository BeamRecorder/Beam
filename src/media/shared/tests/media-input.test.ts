import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  class UnsupportedInputFormatError extends Error {}
  class InputDisposedError extends Error {}
  return {
    MP4: { name: 'MP4', mimeType: 'video/mp4' },
    MP3: { name: 'MP3', mimeType: 'audio/mpeg' },
    QTFF: { name: 'QTFF', mimeType: 'video/quicktime' },
    WEBM: { name: 'WebM', mimeType: 'video/webm' },
    MATROSKA: { name: 'Matroska', mimeType: 'video/x-matroska' },
    WAVE: { name: 'WAVE', mimeType: 'audio/wav' },
    OGG: { name: 'OGG', mimeType: 'audio/ogg' },
    ADTS: { name: 'ADTS', mimeType: 'audio/aac' },
    UnsupportedInputFormatError,
    InputDisposedError,
    Input: vi.fn(),
    UrlSource: vi.fn(),
    inputFactory: null as (() => Record<string, unknown>) | null,
    sources: [] as Array<{
      owner: { free: ReturnType<typeof vi.fn> };
      refs: Array<{ free: ReturnType<typeof vi.fn> }>;
    }>,
  };
});

vi.mock('mediabunny', () => ({
  Input: runtime.Input,
  InputDisposedError: runtime.InputDisposedError,
  MATROSKA: runtime.MATROSKA,
  MP4: runtime.MP4,
  MP3: runtime.MP3,
  QTFF: runtime.QTFF,
  UnsupportedInputFormatError: runtime.UnsupportedInputFormatError,
  WEBM: runtime.WEBM,
  UrlSource: runtime.UrlSource,
  WAVE: runtime.WAVE,
  OGG: runtime.OGG,
  ADTS: runtime.ADTS,
}));

vi.mock('../media-source', async () => {
  const actual = await vi.importActual<typeof import('../media-source')>('../media-source');
  return actual;
});

import { EDITOR_INPUT_FORMATS, inspectMedia, openMediaInput } from '../media-input';
import { MediaSourcePool } from '../media-source';
import type { MediaSourceDescriptor } from '../media-types';

const descriptor = (kind: 'video' | 'audio' = 'video'): MediaSourceDescriptor => ({
  assetId: `asset-${kind}`,
  kind,
  url: `https://cdn.example.test/${kind}.mp4`,
  label: `${kind} source`,
});

const makeVideoTrack = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  getCodec: vi.fn().mockResolvedValue('avc1'),
  getCodecParameterString: vi.fn().mockResolvedValue('avc1.640028'),
  getCodedWidth: vi.fn().mockResolvedValue(1920),
  getCodedHeight: vi.fn().mockResolvedValue(1080),
  getDisplayWidth: vi.fn().mockResolvedValue(1920),
  getDisplayHeight: vi.fn().mockResolvedValue(1080),
  getRotation: vi.fn().mockResolvedValue(90),
  getPixelAspectRatio: vi.fn().mockResolvedValue({ num: 1, den: 1 }),
  getDecoderConfig: vi.fn().mockResolvedValue({ codec: 'avc1.640028' }),
  canDecode: vi.fn().mockResolvedValue(true),
  ...overrides,
});

const makeAudioTrack = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  getCodec: vi.fn().mockResolvedValue('aac'),
  getCodecParameterString: vi.fn().mockResolvedValue('mp4a.40.2'),
  getNumberOfChannels: vi.fn().mockResolvedValue(2),
  getSampleRate: vi.fn().mockResolvedValue(48_000),
  getDecoderConfig: vi.fn().mockResolvedValue({ codec: 'mp4a.40.2' }),
  canDecode: vi.fn().mockResolvedValue(true),
  ...overrides,
});

const makeInput = (overrides: Record<string, unknown> = {}) => ({
  getFormat: vi.fn().mockResolvedValue(runtime.MP4),
  getMimeType: vi.fn().mockResolvedValue('video/mp4'),
  getDurationFromMetadata: vi.fn().mockResolvedValue(12.5),
  getVideoTracks: vi.fn().mockResolvedValue([]),
  getAudioTracks: vi.fn().mockResolvedValue([]),
  computeDuration: vi.fn().mockResolvedValue(12.5),
  dispose: vi.fn(),
  ...overrides,
});

const makePool = () => {
  const pool = new MediaSourcePool();
  runtime.sources.length = 0;
  return pool;
};

beforeEach(() => {
  vi.clearAllMocks();
  runtime.sources.length = 0;
  runtime.UrlSource.mockImplementation(function UrlSourceMock() {
    const source = {
      owner: { free: vi.fn() },
      refs: [] as Array<{ free: ReturnType<typeof vi.fn> }>,
      ref: vi.fn(),
    };
    source.ref.mockImplementation(() => {
      const ref = { free: vi.fn() };
      source.refs.push(ref);
      return ref;
    });
    runtime.sources.push(source);
    return source;
  });
  runtime.inputFactory = () => makeInput();
  runtime.Input.mockImplementation(function InputMock() {
    return runtime.inputFactory!();
  });
});

describe('openMediaInput', () => {
  it('passes video and audio containers to Mediabunny', () => {
    expect(EDITOR_INPUT_FORMATS).toEqual([
      runtime.MP4,
      runtime.QTFF,
      runtime.WEBM,
      runtime.MATROSKA,
      runtime.MP3,
      runtime.WAVE,
      runtime.OGG,
      runtime.ADTS,
    ]);
  });

  it('opens a recognized input and releases input/source resources exactly once', async () => {
    const input = makeInput();
    runtime.inputFactory = () => input;
    const opened = await openMediaInput(descriptor(), makePool());

    expect(opened.descriptor).toEqual(descriptor());
    expect(opened.input).toBe(input);
    expect(runtime.Input).toHaveBeenCalledWith({ source: expect.anything(), formats: EDITOR_INPUT_FORMATS });
    expect(input.dispose).not.toHaveBeenCalled();

    opened.dispose();
    opened.dispose();
    expect(input.dispose).toHaveBeenCalledOnce();
  });

  it('maps unsupported containers and cleans up a constructed input', async () => {
    const input = makeInput({ getFormat: vi.fn().mockRejectedValue(new runtime.UnsupportedInputFormatError()) });
    runtime.inputFactory = () => input;
    const pool = makePool();

    await expect(openMediaInput(descriptor(), pool)).rejects.toMatchObject({
      detail: { kind: 'invalid-container', sourceId: 'asset-video' },
    });
    expect(input.dispose).toHaveBeenCalledOnce();
    expect(pool.size).toBe(0);
  });

  it('maps disposal failures and releases the lease when construction itself throws', async () => {
    const input = makeInput({ getFormat: vi.fn().mockRejectedValue(new runtime.InputDisposedError()) });
    runtime.inputFactory = () => input;
    await expect(openMediaInput(descriptor(), makePool())).rejects.toMatchObject({
      detail: { kind: 'disposed', sourceId: 'asset-video' },
    });
    expect(input.dispose).toHaveBeenCalledOnce();

    const pool = makePool();
    runtime.Input.mockImplementationOnce(() => {
      throw new Error('constructor failed');
    });
    await expect(openMediaInput(descriptor('audio'), pool)).rejects.toMatchObject({
      detail: { kind: 'decode-failure', sourceId: 'asset-audio' },
    });
    expect(pool.size).toBe(0);
  });
});

describe('inspectMedia', () => {
  it('returns complete video and audio metadata and capabilities', async () => {
    const video = makeVideoTrack();
    const audio = makeAudioTrack();
    const input = makeInput({
      getVideoTracks: vi.fn().mockResolvedValue([video]),
      getAudioTracks: vi.fn().mockResolvedValue([audio]),
    });
    runtime.inputFactory = () => input;

    const inspection = await inspectMedia(descriptor(), { pool: makePool() });

    expect(inspection).toEqual({
      metadata: {
        container: 'MP4',
        mimeType: 'video/mp4',
        durationSeconds: 12.5,
        videoTracks: [
          expect.objectContaining({
            trackId: '7',
            codec: 'avc1',
            codecParameter: 'avc1.640028',
            codedWidth: 1920,
            codedHeight: 1080,
            displayWidth: 1920,
            displayHeight: 1080,
            rotation: 90,
            pixelAspectRatio: { numerator: 1, denominator: 1 },
            canDecode: true,
          }),
        ],
        audioTracks: [
          expect.objectContaining({
            trackId: '3',
            codec: 'aac',
            numberOfChannels: 2,
            sampleRate: 48_000,
            canDecode: true,
          }),
        ],
      },
      capabilities: { hasVideo: true, hasAudio: true, canDecodeVideo: true, canDecodeAudio: true },
    });
    expect(input.dispose).toHaveBeenCalledOnce();
  });

  it('uses computed duration when metadata has no duration and passes all tracks through', async () => {
    const video = makeVideoTrack();
    const audio = makeAudioTrack();
    const computeDuration = vi.fn().mockResolvedValue(8.25);
    const input = makeInput({
      getVideoTracks: vi.fn().mockResolvedValue([video]),
      getAudioTracks: vi.fn().mockResolvedValue([audio]),
      getDurationFromMetadata: vi.fn().mockResolvedValue(null),
      computeDuration,
    });
    runtime.inputFactory = () => input;

    const result = await inspectMedia(descriptor(), { pool: makePool() });

    expect(result.metadata.durationSeconds).toBe(8.25);
    expect(computeDuration).toHaveBeenCalledWith([video, audio]);
  });

  it('rejects an empty input and disposes it', async () => {
    const input = makeInput();
    runtime.inputFactory = () => input;

    await expect(inspectMedia(descriptor(), { pool: makePool() })).rejects.toMatchObject({
      detail: { kind: 'empty', sourceId: 'asset-video' },
    });
    expect(input.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'video',
      { getVideoTracks: vi.fn().mockResolvedValue([]), getAudioTracks: vi.fn().mockResolvedValue([makeAudioTrack()]) },
      'video',
    ],
    [
      'audio',
      { getVideoTracks: vi.fn().mockResolvedValue([makeVideoTrack()]), getAudioTracks: vi.fn().mockResolvedValue([]) },
      'audio',
    ],
  ] as const)('rejects a descriptor with a missing %s track', async (kind, methods, track) => {
    const input = makeInput(methods);
    runtime.inputFactory = () => input;

    await expect(inspectMedia(descriptor(kind), { pool: makePool() })).rejects.toMatchObject({
      detail: { kind: 'missing-track', sourceId: `asset-${kind}`, track },
    });
    expect(input.dispose).toHaveBeenCalledOnce();
  });

  it('reports an unsupported codec by default but exposes metadata when decodability is optional', async () => {
    const video = makeVideoTrack({
      canDecode: vi.fn().mockResolvedValue(false),
      getCodec: vi.fn().mockResolvedValue(null),
    });
    const input = makeInput({ getVideoTracks: vi.fn().mockResolvedValue([video]) });
    runtime.inputFactory = () => input;

    await expect(inspectMedia(descriptor(), { pool: makePool() })).rejects.toMatchObject({
      detail: { kind: 'unsupported-codec', track: 'video', codec: null },
    });
    const optional = await inspectMedia(descriptor(), { pool: makePool(), requireDecodable: false });
    expect(optional.capabilities).toMatchObject({ hasVideo: true, canDecodeVideo: false });
  });

  it('maps an input format error, a disposal error, and arbitrary read failures', async () => {
    const unsupported = makeInput({
      getMimeType: vi.fn().mockRejectedValue(new runtime.UnsupportedInputFormatError()),
    });
    runtime.inputFactory = () => unsupported;
    await expect(inspectMedia(descriptor(), { pool: makePool() })).rejects.toMatchObject({
      detail: { kind: 'invalid-container' },
    });
    expect(unsupported.dispose).toHaveBeenCalledOnce();

    const disposed = makeInput({ getMimeType: vi.fn().mockRejectedValue(new runtime.InputDisposedError()) });
    runtime.inputFactory = () => disposed;
    await expect(inspectMedia(descriptor(), { pool: makePool() })).rejects.toMatchObject({
      detail: { kind: 'disposed' },
    });
    expect(disposed.dispose).toHaveBeenCalledOnce();

    const failed = makeInput({ getMimeType: vi.fn().mockRejectedValue(new Error('network read failed')) });
    runtime.inputFactory = () => failed;
    await expect(inspectMedia(descriptor(), { pool: makePool() })).rejects.toMatchObject({
      detail: { kind: 'decode-failure', cause: expect.any(Error) },
    });
    expect(failed.dispose).toHaveBeenCalledOnce();
  });
});
