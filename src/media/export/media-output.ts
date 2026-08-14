import {
  AudioBufferSource,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';

export type MediaExportFormat = 'mp4' | 'webm';

const VIDEO_CODECS: Record<MediaExportFormat, VideoCodec[]> = {
  webm: ['vp9', 'vp8', 'av1'],
  mp4: ['avc'],
};
const AUDIO_CODECS: Record<MediaExportFormat, AudioCodec[]> = { webm: ['opus'], mp4: ['aac'] };

export const findExportVideoCodec = (
  format: MediaExportFormat,
  options: { width: number; height: number; bitrate: number },
) => getFirstEncodableVideoCodec(VIDEO_CODECS[format], options);

export const findExportAudioCodec = (
  format: MediaExportFormat,
  options: { sampleRate: number; numberOfChannels: number; bitrate: number },
) => getFirstEncodableAudioCodec(AUDIO_CODECS[format], options);

export class StreamingMediaOutput {
  private readonly output: Output;
  private readonly video: CanvasSource;
  private readonly audio: AudioBufferSource | null;

  constructor(options: {
    format: MediaExportFormat;
    canvas: HTMLCanvasElement | OffscreenCanvas;
    writable: WritableStream<{ data: Uint8Array; position: number }>;
    videoCodec: VideoCodec;
    videoBitrate: number;
    frameRate: number;
    audioCodec: AudioCodec | null;
    audioBitrate?: number;
  }) {
    this.output = new Output({
      format: options.format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
      target: new StreamTarget(options.writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
    });
    this.video = new CanvasSource(options.canvas, { codec: options.videoCodec, bitrate: options.videoBitrate });
    this.output.addVideoTrack(this.video, { frameRate: options.frameRate });
    this.audio = options.audioCodec
      ? new AudioBufferSource({ codec: options.audioCodec, bitrate: options.audioBitrate ?? 128_000 })
      : null;
    if (this.audio) this.output.addAudioTrack(this.audio);
  }

  async start(audio: AudioBuffer | null): Promise<void> {
    await this.output.start();
    if (audio && this.audio) await this.audio.add(audio);
  }

  addVideoFrame(timestampSeconds: number, durationSeconds: number): Promise<void> {
    return this.video.add(timestampSeconds, durationSeconds);
  }

  finalize(): Promise<void> {
    return this.output.finalize();
  }

  cancel(): Promise<void> {
    return this.output.cancel();
  }
}
