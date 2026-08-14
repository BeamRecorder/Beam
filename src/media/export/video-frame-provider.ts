import { CanvasSink, type WrappedCanvas } from 'mediabunny';
import {
  MediaInputError,
  openMediaInput,
  ownedMediaFrame,
  type MediaFrame,
  type MediaSourceDescriptor,
  type OpenedMediaInput,
} from '../shared';

export class VideoFrameProvider {
  private readonly opened: OpenedMediaInput;
  private readonly descriptor: MediaSourceDescriptor;
  private readonly timestamps: readonly number[];
  private readonly sink: CanvasSink;
  private iterator: AsyncIterator<WrappedCanvas | null> | null = null;
  private nextIndex = 0;
  private disposed = false;

  private constructor(
    opened: OpenedMediaInput,
    descriptor: MediaSourceDescriptor,
    timestamps: readonly number[],
    sink: CanvasSink,
  ) {
    this.opened = opened;
    this.descriptor = descriptor;
    this.timestamps = timestamps;
    this.sink = sink;
  }

  static async create(descriptor: MediaSourceDescriptor, timestamps: readonly number[]): Promise<VideoFrameProvider> {
    if (descriptor.kind !== 'video') {
      throw new MediaInputError({
        kind: 'missing-track',
        sourceId: descriptor.assetId,
        track: 'video',
        message: 'A video frame provider requires a video source.',
      });
    }
    if (timestamps.some((timestamp) => !Number.isFinite(timestamp) || timestamp < 0)) {
      throw new RangeError('Video frame timestamps must be finite positive numbers.');
    }
    const opened = await openMediaInput(descriptor);
    try {
      const track = await opened.input.getPrimaryVideoTrack();
      if (!track) {
        throw new MediaInputError({
          kind: 'missing-track',
          sourceId: descriptor.assetId,
          track: 'video',
          message: 'The export source has no video track.',
        });
      }
      if (!(await track.canDecode())) {
        throw new MediaInputError({
          kind: 'unsupported-codec',
          sourceId: descriptor.assetId,
          track: 'video',
          codec: await track.getCodec(),
          message: 'The export video codec is unsupported by this device.',
        });
      }
      return new VideoFrameProvider(opened, descriptor, timestamps, new CanvasSink(track, { poolSize: 3 }));
    } catch (error) {
      opened.dispose();
      throw error;
    }
  }

  async frameAt(index: number): Promise<MediaFrame> {
    if (this.disposed) throw new Error('Video frame provider is disposed.');
    if (!Number.isInteger(index) || index < this.nextIndex || index >= this.timestamps.length) {
      throw new RangeError('Video frames must be requested once in increasing output order.');
    }
    if (!this.iterator && this.nextIndex === 0 && index > 0) this.nextIndex = index;
    else if (index > this.nextIndex) await this.discardUntil(index);
    const wrapped = await this.nextCanvas(index);
    this.nextIndex = index + 1;
    if (!wrapped) {
      throw new MediaInputError({
        kind: 'decode-failure',
        sourceId: this.descriptor.assetId,
        message: 'The export source did not produce the required video frame.',
      });
    }
    const bitmap =
      'transferToImageBitmap' in wrapped.canvas
        ? wrapped.canvas.transferToImageBitmap()
        : await createImageBitmap(wrapped.canvas);
    return ownedMediaFrame(this.descriptor.assetId, bitmap, wrapped.timestamp, wrapped.duration);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.iterator = null;
    this.opened.dispose();
  }

  private async discardUntil(index: number) {
    while (this.nextIndex < index) {
      await this.nextCanvas(this.nextIndex);
      this.nextIndex += 1;
    }
  }

  private nextCanvas(index: number): Promise<WrappedCanvas | null> {
    const previousTimestamp = index > 0 ? this.timestamps[index - 1]! : null;
    const timestamp = this.timestamps[index]!;
    if (!this.iterator || (previousTimestamp !== null && timestamp < previousTimestamp)) {
      this.iterator = this.sink.canvasesAtTimestamps(this.timestamps.slice(index))[Symbol.asyncIterator]();
    }
    return this.iterator.next().then((result) => (result.done ? null : result.value));
  }
}
