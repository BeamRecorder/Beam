import { VideoSampleSink, type InputVideoTrack, type VideoSinkDecoderOptions } from 'mediabunny';

/** Inspect only recorded timestamps and distinct frames, using one bounded analysis canvas. */
export async function* uniqueHoverFrames(
  track: InputVideoTrack,
  timestamps: Iterable<number>,
  size: { width: number; height: number },
  decoderOptions: VideoSinkDecoderOptions | undefined,
  check: () => void,
) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  try {
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw new Error('Cursor synchronization analysis canvas is unavailable.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const firstTimestamp = await track.getFirstTimestamp();
    check();
    if (!Number.isFinite(firstTimestamp)) throw new Error('Invalid recorded screen start timestamp.');
    function* recordedTimestamps() {
      for (const timestamp of timestamps) {
        // A valid recording may start after zero. There are no pixels to compare before its first image.
        if (timestamp >= firstTimestamp) yield timestamp;
        else check();
      }
    }
    const sink = new VideoSampleSink(track, decoderOptions);
    let previousTime = -Infinity;
    for await (const sample of sink.samplesAtTimestamps(recordedTimestamps(), { skipLiveWait: true })) {
      if (!sample) throw new Error('A recorded screen frame is missing during cursor synchronization.');
      try {
        check();
        if (sample.timestamp <= previousTime) continue;
        previousTime = sample.timestamp;
        // Direct bounded downsampling avoids full-source mipmap canvases intended for final rendering.
        sample.draw(context, 0, 0, size.width, size.height);
        yield { timestamp: sample.timestamp, canvas };
      } finally {
        sample.close();
      }
    }
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
