import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectDroppedMedia } from '../dropped-media';

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
    BlobSource: vi.fn(),
    Input: vi.fn(),
    UrlSource: vi.fn(),
    inputFactory: null as (() => Record<string, unknown>) | null,
    inputs: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('mediabunny', () => ({
  BlobSource: runtime.BlobSource,
  Input: runtime.Input,
  InputDisposedError: runtime.InputDisposedError,
  MATROSKA: runtime.MATROSKA,
  MP4: runtime.MP4,
  MP3: runtime.MP3,
  QTFF: runtime.QTFF,
  UnsupportedInputFormatError: runtime.UnsupportedInputFormatError,
  UrlSource: runtime.UrlSource,
  WAVE: runtime.WAVE,
  OGG: runtime.OGG,
  ADTS: runtime.ADTS,
  WEBM: runtime.WEBM,
}));

const file = (name: string, type = 'video/mp4') => new File(['media'], name, { type });

const videoTrack = (overrides: Record<string, unknown> = {}) => ({
  canDecode: vi.fn().mockResolvedValue(true),
  getCodec: vi.fn().mockResolvedValue('avc1'),
  getDisplayWidth: vi.fn().mockResolvedValue(1920),
  getDisplayHeight: vi.fn().mockResolvedValue(1080),
  ...overrides,
});

const audioTrack = (overrides: Record<string, unknown> = {}) => ({
  canDecode: vi.fn().mockResolvedValue(true),
  getCodec: vi.fn().mockResolvedValue('aac'),
  ...overrides,
});

const input = (overrides: Record<string, unknown> = {}) => ({
  getFormat: vi.fn().mockResolvedValue(runtime.MP4),
  getPrimaryVideoTrack: vi.fn().mockResolvedValue(null),
  getPrimaryAudioTrack: vi.fn().mockResolvedValue(null),
  getDurationFromMetadata: vi.fn().mockResolvedValue(10.5),
  computeDuration: vi.fn().mockResolvedValue(10.5),
  dispose: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  runtime.inputs.length = 0;
  runtime.BlobSource.mockImplementation(function BlobSourceMock() {
    return {};
  });
  runtime.inputFactory = () => input();
  runtime.Input.mockImplementation(function InputMock() {
    const value = runtime.inputFactory!();
    runtime.inputs.push(value);
    return value;
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('inspectDroppedMedia', () => {
  it('rejects GIFs explicitly before probing Mediabunny', async () => {
    await expect(inspectDroppedMedia(file('animation.GIF', 'image/gif'))).rejects.toThrow('GIF not supported');
    expect(runtime.Input).not.toHaveBeenCalled();
    expect(runtime.BlobSource).not.toHaveBeenCalled();
  });

  it('detects images and returns dimensions with a fixed still-image duration', async () => {
    const bitmap = { width: 640, height: 360, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    );
    runtime.inputFactory = () =>
      input({ getFormat: vi.fn().mockRejectedValue(new runtime.UnsupportedInputFormatError()) });

    await expect(inspectDroppedMedia(file('poster.png', 'image/png'))).resolves.toEqual({
      kind: 'image',
      durationMs: 5_000,
      width: 640,
      height: 360,
      hasAudio: false,
      canDecodeAudio: false,
      audioCodec: null,
    });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(runtime.inputs[0]!.dispose).toHaveBeenCalledOnce();
  });

  it('inspects video dimensions, duration, and an integrated audio track', async () => {
    const video = videoTrack();
    const audio = audioTrack();
    const inspected = input({
      getPrimaryVideoTrack: vi.fn().mockResolvedValue(video),
      getPrimaryAudioTrack: vi.fn().mockResolvedValue(audio),
      getDurationFromMetadata: vi.fn().mockResolvedValue(12.25),
    });
    runtime.inputFactory = () => inspected;

    await expect(inspectDroppedMedia(file('recording.mp4'))).resolves.toEqual({
      kind: 'video',
      durationMs: 12_250,
      width: 1920,
      height: 1080,
      hasAudio: true,
      canDecodeAudio: true,
      audioCodec: 'aac',
    });
    expect(inspected.dispose).toHaveBeenCalledOnce();
  });

  it('inspects an audio-only file without video dimensions', async () => {
    const audio = audioTrack({ getCodec: vi.fn().mockResolvedValue('opus') });
    const inspected = input({
      getPrimaryAudioTrack: vi.fn().mockResolvedValue(audio),
      getDurationFromMetadata: vi.fn().mockResolvedValue(4.75),
    });
    runtime.inputFactory = () => inspected;

    await expect(inspectDroppedMedia(file('voice.webm', 'audio/webm'))).resolves.toEqual({
      kind: 'audio',
      durationMs: 4_750,
      width: null,
      height: null,
      hasAudio: true,
      canDecodeAudio: true,
      audioCodec: 'opus',
    });
    expect(inspected.dispose).toHaveBeenCalledOnce();
  });

  it('maps invalid containers and media with no tracks to explicit errors', async () => {
    const invalidInput = input({ getFormat: vi.fn().mockRejectedValue(new runtime.UnsupportedInputFormatError()) });
    runtime.inputFactory = () => invalidInput;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('not an image');
      }),
    );
    await expect(inspectDroppedMedia(file('broken.bin'), 'broken-source')).rejects.toMatchObject({
      detail: { kind: 'invalid-container', sourceId: 'broken-source' },
    });
    expect(invalidInput.dispose).toHaveBeenCalledOnce();

    const emptyInput = input();
    runtime.inputFactory = () => emptyInput;
    await expect(inspectDroppedMedia(file('empty.mp4'))).rejects.toMatchObject({
      detail: { kind: 'empty', sourceId: 'empty.mp4' },
    });
    expect(emptyInput.dispose).toHaveBeenCalledOnce();
  });

  it('rejects a video with an unsupported video codec', async () => {
    const video = videoTrack({
      canDecode: vi.fn().mockResolvedValue(false),
      getCodec: vi.fn().mockResolvedValue('hevc'),
    });
    const inspected = input({ getPrimaryVideoTrack: vi.fn().mockResolvedValue(video) });
    runtime.inputFactory = () => inspected;

    await expect(inspectDroppedMedia(file('hevc.mov'))).rejects.toMatchObject({
      detail: { kind: 'unsupported-codec', sourceId: 'hevc.mov', track: 'video', codec: 'hevc' },
    });
    expect(inspected.dispose).toHaveBeenCalledOnce();
  });

  it('keeps a decodable video valid while reporting an undecodable integrated audio track', async () => {
    const video = videoTrack();
    const audio = audioTrack({
      canDecode: vi.fn().mockResolvedValue(false),
      getCodec: vi.fn().mockResolvedValue('ac-4'),
    });
    const inspected = input({
      getPrimaryVideoTrack: vi.fn().mockResolvedValue(video),
      getPrimaryAudioTrack: vi.fn().mockResolvedValue(audio),
    });
    runtime.inputFactory = () => inspected;

    await expect(inspectDroppedMedia(file('mixed.mp4'))).resolves.toEqual({
      kind: 'video',
      durationMs: 10_500,
      width: 1920,
      height: 1080,
      hasAudio: true,
      canDecodeAudio: false,
      audioCodec: 'ac-4',
    });
    expect(inspected.dispose).toHaveBeenCalledOnce();
  });
});
