import { AudioSampleSink } from 'mediabunny';
import { MediaInputError, openMediaInput, type MediaSourceDescriptor } from '../shared';
import { WaveformBands } from './waveform-bands';
import type { WaveformExtractionOptions } from './waveform-types';

export async function extractWaveformPeaks(
  descriptor: MediaSourceDescriptor,
  startSeconds: number,
  endSeconds: number,
  pointCount: number,
  options?: WaveformExtractionOptions,
): Promise<Float32Array> {
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    startSeconds < 0 ||
    endSeconds <= startSeconds ||
    !Number.isSafeInteger(pointCount) ||
    pointCount <= 0 ||
    (options && (!Number.isSafeInteger(options.pointsPerChunk) || options.pointsPerChunk <= 0))
  )
    throw new RangeError('Invalid waveform range or point count.');

  const opened = await openMediaInput({ ...descriptor, kind: 'audio' });
  try {
    const track = await opened.input.getPrimaryAudioTrack();
    if (!track)
      throw new MediaInputError({
        kind: 'missing-track',
        sourceId: descriptor.assetId,
        track: 'audio',
        message: 'The waveform source has no audio track.',
      });
    if (!(await track.canDecode()))
      throw new MediaInputError({
        kind: 'unsupported-codec',
        sourceId: descriptor.assetId,
        track: 'audio',
        codec: await track.getCodec(),
        message: 'The waveform audio codec is unsupported.',
      });

    const peaks = new Float32Array(pointCount * 2);
    const bands = new Float32Array(pointCount * 4);
    const pointsPerSecond = pointCount / (endSeconds - startSeconds);
    let analyser: WaveformBands | undefined;
    let sampleRate = 0;
    let channels: Float32Array[] = [];
    let published = 0;
    let lastPublish = performance.now();
    let lastYield = lastPublish;
    const publish = (available: number, complete = false) => {
      if (!options || available <= published) return;
      const now = performance.now();
      if (!complete && available - published < options.pointsPerChunk && now - lastPublish < 32) return;
      // Transfer only newly completed bins; the unanalysed tail remains visibly pending.
      options.onProgress({
        pointOffset: published,
        peaks: peaks.slice(published * 2, available * 2),
        bands: bands.slice(published * 4, available * 4),
        complete,
      });
      published = available;
      lastPublish = now;
    };

    const sink = new AudioSampleSink(track);
    for await (const sample of sink.samples(startSeconds, endSeconds)) {
      try {
        if (options?.shouldStop()) return peaks;
        if (sample.sampleRate !== sampleRate) {
          analyser?.flush();
          sampleRate = sample.sampleRate;
          analyser = new WaveformBands(sampleRate, bands);
        }
        if (channels.length !== sample.numberOfChannels || (channels[0]?.length ?? 0) < sample.numberOfFrames) {
          channels = Array.from({ length: sample.numberOfChannels }, () => new Float32Array(sample.numberOfFrames));
        }
        channels.forEach((channel, planeIndex) => sample.copyTo(channel, { planeIndex, format: 'f32-planar' }));
        const first = Math.max(0, Math.ceil((startSeconds - sample.timestamp) * sampleRate));
        const end = Math.min(sample.numberOfFrames, Math.ceil((endSeconds - sample.timestamp) * sampleRate));
        for (let frame = first; frame < end; frame += 1) {
          const point = Math.floor((sample.timestamp + frame / sampleRate - startSeconds) * pointsPerSecond + 1e-9);
          if (point < 0 || point >= pointCount) continue;
          let mono = 0;
          for (const channel of channels) {
            const value = Number.isFinite(channel[frame]) ? channel[frame]! : 0;
            mono += value;
            // Channel extrema preserve transients and anti-phase stereo energy.
            peaks[point * 2] = Math.min(peaks[point * 2]!, value);
            peaks[point * 2 + 1] = Math.max(peaks[point * 2 + 1]!, value);
          }
          analyser!.add(mono / Math.max(1, channels.length), point);
        }
        const available = Math.max(
          0,
          Math.min(
            pointCount,
            Math.floor((sample.timestamp + sample.numberOfFrames / sampleRate - startSeconds) * pointsPerSecond + 1e-9),
          ),
        );
        analyser?.flush();
        publish(available, available === pointCount);
      } finally {
        sample.close();
      }
      // Let clear/new viewport messages interrupt even when the decoder already has buffered PCM.
      if (performance.now() - lastYield >= 12) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    if (!options?.shouldStop()) publish(pointCount, true);
    return peaks;
  } finally {
    opened.dispose();
  }
}
