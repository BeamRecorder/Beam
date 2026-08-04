import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type VideoSample } from 'mediabunny';
import { tNamespace } from '../../../i18n';

const $t = tNamespace('exporter');

/**
 * Reads source frames in presentation order. Keeping one decoder alive avoids a
 * keyframe seek for every output frame, which was the main export bottleneck.
 */
export class VideoFrameProvider {
  private readonly input: Input;
  private readonly sink: VideoSampleSink;
  private readonly timestamps: number[];
  private iterator: AsyncIterator<VideoSample | null> | null = null;
  private index = 0;

  private constructor(input: Input, sink: VideoSampleSink, timestamps: number[]) {
    this.input = input;
    this.sink = sink;
    this.timestamps = timestamps;
  }

  static async create(src: string, timestamps: number[]): Promise<VideoFrameProvider | null> {
    const response = await fetch(src);
    if (!response.ok) throw new Error($t('unableToReadVideoSource', { src }));
    const input = new Input({
      source: new BlobSource(await response.blob()),
      formats: ALL_FORMATS,
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      input.dispose();
      return null;
    }
    const decoderConfig = await track.getDecoderConfig();
    if (
      typeof VideoDecoder === 'undefined' ||
      !decoderConfig ||
      !(await VideoDecoder.isConfigSupported(decoderConfig)).supported
    ) {
      input.dispose();
      return null;
    }
    // Let Chromium choose a supported decoder configuration. Forcing a hardware
    // preference can make otherwise playable recordings fail VideoDecoder.configure.
    return new VideoFrameProvider(input, new VideoSampleSink(track), timestamps);
  }

  async frameAt(index: number): Promise<VideoFrame | null> {
    while (this.index < index) {
      const discarded = await this.next();
      discarded?.close();
      this.index += 1;
    }
    if (this.index !== index) return null;
    const sample = await this.next();
    this.index += 1;
    if (!sample) return null;
    try {
      return sample.toVideoFrame();
    } finally {
      sample.close();
    }
  }

  private async next() {
    if (!this.iterator) this.iterator = this.sink.samplesAtTimestamps(this.timestamps)[Symbol.asyncIterator]();
    const result = await this.iterator.next();
    return result.done ? null : result.value;
  }

  dispose() {
    this.input.dispose();
  }
}
