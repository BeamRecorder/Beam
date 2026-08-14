import { AudioSampleSink } from 'mediabunny';
import { MediaInputError, openMediaInput, type MediaSourceDescriptor } from '../shared';

export async function extractWaveformPeaks(
  descriptor: MediaSourceDescriptor,
  startSeconds: number,
  endSeconds: number,
  pointCount: number,
): Promise<Float32Array> {
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    startSeconds < 0 ||
    endSeconds <= startSeconds ||
    !Number.isSafeInteger(pointCount) ||
    pointCount <= 0
  ) {
    throw new RangeError('Invalid waveform range or point count.');
  }
  const opened = await openMediaInput({ ...descriptor, kind: 'audio' });
  try {
    const track = await opened.input.getPrimaryAudioTrack();
    if (!track) {
      throw new MediaInputError({
        kind: 'missing-track',
        sourceId: descriptor.assetId,
        track: 'audio',
        message: 'The waveform source has no audio track.',
      });
    }
    if (!(await track.canDecode())) {
      throw new MediaInputError({
        kind: 'unsupported-codec',
        sourceId: descriptor.assetId,
        track: 'audio',
        codec: await track.getCodec(),
        message: 'The waveform audio codec is unsupported.',
      });
    }
    const range = endSeconds - startSeconds;
    const sink = new AudioSampleSink(track);
    const timestamps = Array.from(
      { length: pointCount },
      (_, point) => startSeconds + ((point + 0.5) / pointCount) * range,
    );
    const peaks = new Float32Array(pointCount * 2);
    let point = 0;
    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      if (!sample) {
        point += 1;
        continue;
      }
      try {
        const channels = Array.from({ length: sample.numberOfChannels }, (_, channel) => {
          const data = new Float32Array(sample.numberOfFrames);
          sample.copyTo(data, { planeIndex: channel, format: 'f32-planar' });
          return data;
        });
        let minimum = Number.POSITIVE_INFINITY;
        let maximum = Number.NEGATIVE_INFINITY;
        for (let sampleIndex = 0; sampleIndex < sample.numberOfFrames; sampleIndex += 1) {
          let value = 0;
          for (const channel of channels) value += channel[sampleIndex] ?? 0;
          value /= Math.max(1, channels.length);
          minimum = Math.min(minimum, value);
          maximum = Math.max(maximum, value);
        }
        peaks[point * 2] = Number.isFinite(minimum) ? minimum : 0;
        peaks[point * 2 + 1] = Number.isFinite(maximum) ? maximum : 0;
      } finally {
        sample.close();
      }
      point += 1;
    }
    return peaks;
  } finally {
    opened.dispose();
  }
}
