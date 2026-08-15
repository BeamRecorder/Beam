import {
  AudioSampleSource,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioSample,
} from 'mediabunny';
import { bitrateFor } from '../export-presets';
import type { ExportRequest } from '../export-types';
import type { ExportWorkerResponse } from './export-worker-protocol';

type Ack = { resolve(): void; reject(error: Error): void; sentAt: number };

export class ExportWorkerOutput {
  private readonly pending = new Map<number, Ack>();
  private readonly output: Output;
  private readonly video: CanvasSource;
  private readonly audio: AudioSampleSource | null;
  private readonly videoCodec: string;
  private readonly audioCodec: string | null;
  private sequence = 0;
  private chunkCount = 0;
  private bytesWritten = 0;
  private ipcWriteWaitMs = 0;

  private constructor(
    request: ExportRequest,
    canvas: OffscreenCanvas,
    videoCodec: import('mediabunny').VideoCodec,
    audioCodec: import('mediabunny').AudioCodec | null,
  ) {
    this.videoCodec = videoCodec;
    this.audioCodec = audioCodec;
    const writable = new WritableStream<{ data: Uint8Array; position: number }>({
      write: ({ data, position }) =>
        new Promise<void>((resolve, reject) => {
          const sequence = this.sequence++;
          this.chunkCount += 1;
          this.bytesWritten += data.byteLength;
          this.pending.set(sequence, { resolve, reject, sentAt: performance.now() });
          const message: ExportWorkerResponse = { type: 'chunk', sequence, position, data };
          self.postMessage(message, { transfer: [data.buffer] });
        }),
    });
    this.output = new Output({
      format: request.format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
      target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
    });
    this.video = new CanvasSource(canvas, {
      codec: videoCodec,
      bitrate: bitrateFor(request.preset, canvas.width, canvas.height, request.snapshot.render.fps),
    });
    this.output.addVideoTrack(this.video, { frameRate: request.snapshot.render.fps });
    this.audio = audioCodec ? new AudioSampleSource({ codec: audioCodec, bitrate: 128_000 }) : null;
    if (this.audio) this.output.addAudioTrack(this.audio);
  }

  static async create(request: ExportRequest, canvas: OffscreenCanvas, withAudio: boolean) {
    const videoCodec = await getFirstEncodableVideoCodec(request.format === 'webm' ? ['vp9', 'vp8', 'av1'] : ['avc'], {
      width: canvas.width,
      height: canvas.height,
      bitrate: bitrateFor(request.preset, canvas.width, canvas.height, request.snapshot.render.fps),
    });
    if (!videoCodec) throw new Error(`${request.format.toUpperCase()} video is not encodable on this device.`);
    const audioCodec = withAudio
      ? await getFirstEncodableAudioCodec(request.format === 'webm' ? ['opus'] : ['aac'], {
          sampleRate: 48_000,
          numberOfChannels: 2,
          bitrate: 128_000,
        })
      : null;
    if (withAudio && !audioCodec)
      throw new Error(`${request.format.toUpperCase()} audio is not encodable on this device.`);
    return new ExportWorkerOutput(request, canvas, videoCodec, audioCodec);
  }

  start() {
    return this.output.start();
  }
  addVideo(timestamp: number, duration: number) {
    return this.video.add(timestamp, duration);
  }
  async addAudio(sample: AudioSample) {
    if (!this.audio) {
      sample.close();
      return;
    }
    try {
      await this.audio.add(sample);
    } finally {
      sample.close();
    }
  }
  closeAudio() {
    this.audio?.close();
  }
  closeVideo() {
    this.video.close();
  }
  acknowledge(sequence: number) {
    const ack = this.pending.get(sequence);
    if (!ack) return;
    this.pending.delete(sequence);
    this.ipcWriteWaitMs += performance.now() - ack.sentAt;
    ack.resolve();
  }
  reject(sequence: number, message: string) {
    const ack = this.pending.get(sequence);
    if (!ack) return;
    this.pending.delete(sequence);
    ack.reject(new Error(message));
  }
  finalize() {
    return this.output.finalize();
  }
  diagnostics() {
    return {
      videoCodec: this.videoCodec,
      audioCodec: this.audioCodec,
      chunkCount: this.chunkCount,
      bytesWritten: this.bytesWritten,
      ipcWriteWaitMs: this.ipcWriteWaitMs,
    };
  }
  cancel() {
    for (const ack of this.pending.values()) ack.reject(new DOMException('Export cancelled.', 'AbortError'));
    this.pending.clear();
    return this.output.cancel();
  }
}
