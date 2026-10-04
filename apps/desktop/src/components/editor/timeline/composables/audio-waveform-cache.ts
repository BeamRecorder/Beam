import type { PreparedWaveform, StoredWaveformSlice, WaveformRequest, WaveformSegment } from './audio-waveform-types';

export const waveformSourceKey = (request: WaveformRequest): string =>
  `${request.asset?.id ?? ''}:${request.asset?.src ?? ''}`;

/** Keep the last real image at its source-time position while a different viewport refines. */
export function retainWaveform(
  slice: StoredWaveformSlice | undefined,
  request: WaveformRequest,
): StoredWaveformSlice | undefined {
  if (
    !slice ||
    slice.sourceKey !== waveformSourceKey(request) ||
    slice.sourceEndSeconds <= request.sourceStartSeconds ||
    slice.sourceStartSeconds >= request.sourceEndSeconds
  )
    return;
  const percentPerSecond = request.widthPercent / (request.sourceEndSeconds - request.sourceStartSeconds);
  return {
    ...slice,
    leftPercent: request.leftPercent + (slice.sourceStartSeconds - request.sourceStartSeconds) * percentPerSecond,
    widthPercent: (slice.sourceEndSeconds - slice.sourceStartSeconds) * percentPerSecond,
  };
}

/** Reuse equal/finer source bins across zoom, pan, splits and clip placement changes. */
export function prepareWaveform(
  request: WaveformRequest,
  cached: Iterable<StoredWaveformSlice>,
  workerCount: number,
): PreparedWaveform {
  const peaks = new Float32Array(request.pointCount * 2);
  const bands = new Float32Array(request.pointCount * 4);
  const available = new Uint8Array(request.pointCount);
  const step = (request.sourceEndSeconds - request.sourceStartSeconds) / request.pointCount;
  const sourceKey = waveformSourceKey(request);
  let reusedPoints = 0;
  for (const slice of [...cached].reverse()) {
    if (slice.sourceKey !== sourceKey) continue;
    const count = slice.peaks.length / 2;
    const cachedStep = (slice.sourceEndSeconds - slice.sourceStartSeconds) / count;
    if (cachedStep > step * (1 + 1e-7)) continue;
    const firstPoint = Math.max(0, Math.ceil((slice.sourceStartSeconds - request.sourceStartSeconds) / step - 1e-7));
    const lastPoint = Math.min(
      request.pointCount,
      Math.floor((slice.sourceEndSeconds - request.sourceStartSeconds) / step + 1e-7),
    );
    for (let point = firstPoint; point < lastPoint; point += 1) {
      if (available[point]) continue;
      const start = request.sourceStartSeconds + point * step;
      const end = start + step;
      const first = Math.max(0, Math.floor((start - slice.sourceStartSeconds) / cachedStep + 1e-7));
      const last = Math.min(count, Math.ceil((end - slice.sourceStartSeconds) / cachedStep - 1e-7));
      if (
        slice.loadingSegments.some(
          ({ leftPercent, widthPercent }) =>
            (first / count) * 100 < leftPercent + widthPercent - 1e-7 && (last / count) * 100 > leftPercent + 1e-7,
        )
      )
        continue;
      // Peak pooling preserves short transients when displaying a coarser level of detail.
      for (let index = first; index < last; index += 1) {
        peaks[point * 2] = Math.min(peaks[point * 2]!, slice.peaks[index * 2]!);
        peaks[point * 2 + 1] = Math.max(peaks[point * 2 + 1]!, slice.peaks[index * 2 + 1]!);
        for (let band = 0; band < 4; band += 1) {
          bands[point * 4 + band] = Math.max(bands[point * 4 + band]!, slice.bands[index * 4 + band]!);
        }
      }
      available[point] = 1;
      reusedPoints += 1;
    }
    if (reusedPoints === request.pointCount) break;
  }
  const segments: WaveformSegment[] = [];
  const segmentSize = Math.max(1, Math.ceil((request.pointCount - reusedPoints) / workerCount));
  let point = 0;
  while (point < request.pointCount) {
    if (available[point]) {
      point += 1;
      continue;
    }
    const start = point;
    while (point < request.pointCount && !available[point] && point - start < segmentSize) point += 1;
    segments.push({
      index: segments.length,
      count: 0,
      pointOffset: start,
      pointCount: point - start,
      startSeconds: request.sourceStartSeconds + start * step,
      endSeconds: request.sourceStartSeconds + point * step,
    });
  }
  for (const segment of segments) segment.count = segments.length;
  return { peaks, bands, segments, reusedPoints };
}
