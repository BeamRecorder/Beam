import {
  AudioSampleSource,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  type AudioSample,
} from 'mediabunny';
import { bitrateFor } from '@beam/encoder/export-presets';
import type { ExportRequest } from '@beam/encoder/export-types';
import type { ExportWorkerResponse } from '@beam/encoder/mediabunny/export-worker-protocol';
import { selectVideoEncoder } from '@beam/encoder/mediabunny/video-encoder-selection';
import type { VideoEncoderSelection } from '@beam/encoder/mediabunny/video-encoder-selection-types';

type Ack = { resolve(): void; reject(error: Error): void; sentAt: number };
type AudioEncoderImplementation = 'webcodecs' | 'mediabunny-aac';
type AudioEncoderSelection = {
  codec: import('mediabunny').AudioCodec;
  implementation: AudioEncoderImplementation;
};

const AUDIO_ENCODING_OPTIONS = {
  sampleRate: 48_000,
  numberOfChannels: 2,
  bitrate: 128_000,
};

async function selectAudioEncoder(request: ExportRequest, withAudio: boolean): Promise<AudioEncoderSelection | null> {
  if (!withAudio) return null;
  const codecs: import('mediabunny').AudioCodec[] = request.format === 'webm' ? ['opus'] : ['aac'];
  let codec = await getFirstEncodableAudioCodec(codecs, AUDIO_ENCODING_OPTIONS);
  if (codec) return { codec, implementation: 'webcodecs' };

  if (request.format === 'mp4') {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
    codec = await getFirstEncodableAudioCodec(codecs, AUDIO_ENCODING_OPTIONS);
    if (codec) return { codec, implementation: 'mediabunny-aac' };
  }

  throw new Error(`${request.format.toUpperCase()} audio is not encodable on this device.`);
}

export class ExportWorkerOutput {
  private readonly pending = new Map<number, Ack>();
  private readonly output: Output;
  private readonly video: CanvasSource;
  private readonly audio: AudioSampleSource | null;
  private readonly videoCodec: string;
  private readonly audioCodec: string | null;
  private readonly audioEncoderImplementation: AudioEncoderImplementation | null;
  private readonly hardwareAcceleration: VideoEncoderSelection['hardwareAcceleration'];
  private readonly encoderBitrateMode: 'variable' | 'constant';
  private readonly hardwareEncoderCheck: VideoEncoderSelection['hardwareEncoderCheck'];
  private readonly hardwareEncoderError: string | null;
  private sequence = 0;
  private chunkCount = 0;
  private bytesWritten = 0;
  private ipcWriteWaitMs = 0;
  private encoderCodec: string | null = null;
  private encoderBitrate: number | null = null;
  private encodedPacketCount = 0;
  private keyFrameCount = 0;
  private encodedVideoBytes = 0;
  private cancelPromise: Promise<void> | null = null;

  private constructor(
    request: ExportRequest,
    canvas: OffscreenCanvas,
    videoSelection: VideoEncoderSelection,
    audioSelection: AudioEncoderSelection | null,
  ) {
    this.videoCodec = videoSelection.codec;
    this.audioCodec = audioSelection?.codec ?? null;
    this.audioEncoderImplementation = audioSelection?.implementation ?? null;
    this.hardwareAcceleration = videoSelection.hardwareAcceleration;
    this.encoderBitrateMode = videoSelection.bitrateMode;
    this.hardwareEncoderCheck = videoSelection.hardwareEncoderCheck;
    this.hardwareEncoderError = videoSelection.hardwareEncoderError;
    const writable = new WritableStream<{ data: Uint8Array; position: number }>({
      write: ({ data, position }) =>
        new Promise<void>((resolve, reject) => {
          const sequence = this.sequence++;
          this.chunkCount += 1;
          this.bytesWritten += data.byteLength;
          this.pending.set(sequence, { resolve, reject, sentAt: performance.now() });
          // StreamTarget may retain this view until mux finalization; only detach an owned copy.
          const transferredData = data.slice();
          const message: ExportWorkerResponse = { type: 'chunk', sequence, position, data: transferredData };
          self.postMessage(message, { transfer: [transferredData.buffer] });
        }),
    });
    this.output = new Output({
      format: request.format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
      target: new StreamTarget(writable, { chunked: true, chunkSize: 16 * 1024 * 1024 }),
    });
    this.video = new CanvasSource(canvas, {
      codec: videoSelection.codec,
      quality: videoSelection.quality,
      hardwareAcceleration: videoSelection.hardwareAcceleration,
      latencyMode: 'quality',
      onEncoderConfig: (config) => {
        this.encoderCodec = config.codec;
        this.encoderBitrate = config.bitrate ?? null;
      },
      onEncodedPacket: (packet) => {
        this.encodedPacketCount += 1;
        this.encodedVideoBytes += packet.byteLength;
        if (packet.type === 'key') this.keyFrameCount += 1;
      },
    });
    this.output.addVideoTrack(this.video, { frameRate: request.snapshot.render.fps });
    this.audio = audioSelection
      ? new AudioSampleSource({ codec: audioSelection.codec, bitrate: AUDIO_ENCODING_OPTIONS.bitrate })
      : null;
    if (this.audio) this.output.addAudioTrack(this.audio);
  }

  static async create(request: ExportRequest, canvas: OffscreenCanvas, withAudio: boolean) {
    const videoSelection = await selectVideoEncoder({
      format: request.format,
      width: canvas.width,
      height: canvas.height,
      frameRate: request.snapshot.render.fps,
      bitrate: bitrateFor(request.preset, canvas.width, canvas.height, request.snapshot.render.fps),
    });
    const audioSelection = await selectAudioEncoder(request, withAudio);
    return new ExportWorkerOutput(request, canvas, videoSelection, audioSelection);
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
      ...(this.audioEncoderImplementation ? { audioEncoderImplementation: this.audioEncoderImplementation } : {}),
      chunkCount: this.chunkCount,
      bytesWritten: this.bytesWritten,
      ipcWriteWaitMs: this.ipcWriteWaitMs,
      hardwareAcceleration: this.hardwareAcceleration,
      encoderCodec: this.encoderCodec,
      encoderBitrate: this.encoderBitrate,
      encoderBitrateMode: this.encoderBitrateMode,
      hardwareEncoderCheck: this.hardwareEncoderCheck,
      hardwareEncoderError: this.hardwareEncoderError,
      encodedPacketCount: this.encodedPacketCount,
      keyFrameCount: this.keyFrameCount,
      encodedVideoBytes: this.encodedVideoBytes,
    };
  }
  cancel() {
    if (this.cancelPromise) return this.cancelPromise;
    for (const ack of this.pending.values()) ack.reject(new DOMException('Export cancelled.', 'AbortError'));
    this.pending.clear();
    this.cancelPromise = this.output.cancel();
    return this.cancelPromise;
  }
}
