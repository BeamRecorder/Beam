import { AudioBufferSink } from 'mediabunny';
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
    const minimums = new Float32Array(pointCount);
    const maximums = new Float32Array(pointCount);
    minimums.fill(Number.POSITIVE_INFINITY);
    maximums.fill(Number.NEGATIVE_INFINITY);
    const range = endSeconds - startSeconds;
    const sink = new AudioBufferSink(track);
    for await (const wrapped of sink.buffers(startSeconds, endSeconds)) {
      const buffer = wrapped.buffer;
      const first = Math.max(0, Math.floor((startSeconds - wrapped.timestamp) * buffer.sampleRate));
      const last = Math.min(buffer.length, Math.ceil((endSeconds - wrapped.timestamp) * buffer.sampleRate));
      for (let sampleIndex = first; sampleIndex < last; sampleIndex += 1) {
        let value = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          value += buffer.getChannelData(channel)[sampleIndex] ?? 0;
        }
        value /= Math.max(1, buffer.numberOfChannels);
        const timestamp = wrapped.timestamp + sampleIndex / buffer.sampleRate;
        const point = Math.min(
          pointCount - 1,
          Math.max(0, Math.floor(((timestamp - startSeconds) / range) * pointCount)),
        );
        minimums[point] = Math.min(minimums[point]!, value);
        maximums[point] = Math.max(maximums[point]!, value);
      }
    }
    const peaks = new Float32Array(pointCount * 2);
    for (let point = 0; point < pointCount; point += 1) {
      peaks[point * 2] = Number.isFinite(minimums[point]) ? minimums[point]! : 0;
      peaks[point * 2 + 1] = Number.isFinite(maximums[point]) ? maximums[point]! : 0;
    }
    return peaks;
  } finally {
    opened.dispose();
  }
}
