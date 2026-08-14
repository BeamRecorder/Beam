import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findExportAudioCodec, findExportVideoCodec, StreamingMediaOutput } from '../media-output';

const runtime = vi.hoisted(() => ({
  outputs: [] as Array<Record<string, unknown>>,
  videos: [] as Array<Record<string, unknown>>,
  audios: [] as Array<Record<string, unknown>>,
  videoCodec: vi.fn(),
  audioCodec: vi.fn(),
}));

vi.mock('mediabunny', () => ({
  AudioBufferSource: class AudioBufferSource {
    add = vi.fn(async () => undefined);

    constructor(options: unknown) {
      runtime.audios.push(this as unknown as Record<string, unknown>);
      Object.assign(this, { options });
    }
  },
  CanvasSource: class CanvasSource {
    add = vi.fn(async () => undefined);

    constructor(canvas: unknown, options: unknown) {
      runtime.videos.push(this as unknown as Record<string, unknown>);
      Object.assign(this, { canvas, options });
    }
  },
  Mp4OutputFormat: class Mp4OutputFormat {},
  WebMOutputFormat: class WebMOutputFormat {},
  StreamTarget: class StreamTarget {
    constructor(stream: unknown, options: unknown) {
      Object.assign(this, { stream, options });
    }
  },
  Output: class Output {
    readonly start = vi.fn(async () => undefined);
    readonly finalize = vi.fn(async () => undefined);
    readonly cancel = vi.fn(async () => undefined);
    readonly addVideoTrack = vi.fn();
    readonly addAudioTrack = vi.fn();

    constructor(options: unknown) {
      runtime.outputs.push(this as unknown as Record<string, unknown>);
      Object.assign(this, { options });
    }
  },
  getFirstEncodableVideoCodec: runtime.videoCodec,
  getFirstEncodableAudioCodec: runtime.audioCodec,
}));

const canvas = {} as HTMLCanvasElement;
const writable = {} as WritableStream<{ data: Uint8Array; position: number }>;

beforeEach(() => {
  runtime.outputs.length = 0;
  runtime.videos.length = 0;
  runtime.audios.length = 0;
  runtime.videoCodec.mockReset().mockReturnValue('vp9');
  runtime.audioCodec.mockReset().mockReturnValue('opus');
});

describe('media output primitives', () => {
  it('selects codecs from the requested container candidates', () => {
    expect(findExportVideoCodec('webm', { width: 1920, height: 1080, bitrate: 8_000_000 })).toBe('vp9');
    expect(runtime.videoCodec).toHaveBeenCalledWith(['vp9', 'vp8', 'av1'], {
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
    });
    expect(findExportAudioCodec('mp4', { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 })).toBe('opus');
    expect(runtime.audioCodec).toHaveBeenCalledWith(['aac'], {
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  });

  it('streams video and optional audio through one output and finalizes', async () => {
    const media = new StreamingMediaOutput({
      format: 'webm',
      canvas,
      writable,
      videoCodec: 'vp9',
      videoBitrate: 8_000_000,
      frameRate: 60,
      audioCodec: 'opus',
      audioBitrate: 128_000,
    });
    const output = runtime.outputs[0]!;
    const video = runtime.videos[0]!;
    const audio = runtime.audios[0]!;
    const audioBuffer = {} as AudioBuffer;

    expect(output.addVideoTrack).toHaveBeenCalledWith(video, { frameRate: 60 });
    expect(output.addAudioTrack).toHaveBeenCalledWith(audio);
    await media.start(audioBuffer);
    expect(output.start).toHaveBeenCalledOnce();
    expect(audio.add).toHaveBeenCalledWith(audioBuffer);
    await media.addVideoFrame(1.25, 1 / 60);
    expect(video.add).toHaveBeenCalledWith(1.25, 1 / 60);
    await media.finalize();
    expect(output.finalize).toHaveBeenCalledOnce();
  });

  it('does not create or add an audio track when audio is unavailable', async () => {
    const media = new StreamingMediaOutput({
      format: 'mp4',
      canvas,
      writable,
      videoCodec: 'avc',
      videoBitrate: 4_000_000,
      frameRate: 30,
      audioCodec: null,
    });
    const output = runtime.outputs[0]!;
    expect(runtime.audios).toHaveLength(0);
    expect(output.addAudioTrack).not.toHaveBeenCalled();
    await media.start({} as AudioBuffer);
    expect(output.start).toHaveBeenCalledOnce();
    await media.cancel();
    expect(output.cancel).toHaveBeenCalledOnce();
  });
});
