import type { CursorHoverRange, CursorHoverSync } from '@beam/engine/cursor/cursor-hover-types';
import { MAX_CURSOR_HOVER_RANGES } from '@beam/engine/cursor/cursor-hover-sync';
import { openMediaInput } from '../../shared/media-input';
import { mediaSourceDescriptor } from '../../shared/media-source';
import { softwareLinuxDecoderOptions } from '../../playback/playback-decoder';
import { HoverDifferenceGpu } from './hover-difference-gpu';
import { detectsCursorHover } from './hover-detection';
import { validateHoverInput } from './hover-input';
import { hoverPointAt, hoverTimestamps } from './hover-path';
import type { HoverAnalysisInput, HoverPoint } from './hover-types';
import { uniqueHoverFrames } from './hover-frames';

/** Ranges retain the recording clock. Nearby row transitions stay pinned as one gesture. */
export function addHoverRange(ranges: CursorHoverRange[], start: number, end: number) {
  const previous = ranges.at(-1);
  if (previous && start - previous.endSeconds <= 0.12) previous.endSeconds = Math.max(end, previous.endSeconds);
  else {
    if (ranges.length >= MAX_CURSOR_HOVER_RANGES) throw new RangeError('Too many cursor hover transitions.');
    ranges.push({ startSeconds: start, endSeconds: end });
  }
}

export async function analyzeCursorHovers(
  input: HoverAnalysisInput,
  signal: AbortSignal,
  progress: () => void = () => {},
): Promise<CursorHoverSync> {
  validateHoverInput(input);
  signal.throwIfAborted();
  const deadline = new AbortController();
  const combined = AbortSignal.any([signal, deadline.signal]);
  let timer: ReturnType<typeof setTimeout>;
  const heartbeat = () => {
    clearTimeout(timer);
    timer = setTimeout(() => deadline.abort(new Error('Cursor synchronization decoder timed out.')), 30_000);
    progress();
  };
  try {
    return await analyzeFrames(input, combined, heartbeat);
  } catch (error) {
    if (combined.aborted) throw combined.reason;
    throw error;
  } finally {
    clearTimeout(timer!);
  }
}

async function analyzeFrames(
  input: HoverAnalysisInput,
  signal: AbortSignal,
  progress: () => void,
): Promise<CursorHoverSync> {
  const ranges: CursorHoverRange[] = [];
  const check = () => {
    signal.throwIfAborted();
    progress();
  };
  check();
  for (const source of input.sources) {
    const times = hoverTimestamps(input.path, source.startSeconds, source.durationSeconds);
    const first = times.next();
    if (first.done) continue;
    check();
    const opened = await openMediaInput(
      mediaSourceDescriptor({ id: source.id, name: source.id, kind: 'video', src: source.src }),
      undefined,
      signal,
    );
    let gpu: HoverDifferenceGpu | null = null;
    try {
      check();
      const track = await opened.input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode()))
        throw new Error('Recorded screen cannot be decoded for cursor synchronization.');
      const width = await track.getDisplayWidth(),
        height = await track.getDisplayHeight();
      if (![width, height].every((value) => Number.isFinite(value) && value > 0))
        throw new Error('Invalid recorded screen dimensions.');
      const scale = Math.min(1, 384 / Math.max(width, height));
      const size = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
      gpu = new HoverDifferenceGpu(size.width, size.height);
      const decoderOptions = softwareLinuxDecoderOptions(await track.getCodec(), navigator.userAgent);
      function* timestamps() {
        yield first.value!;
        yield* times;
      }
      let previous: HoverPoint | null = null;
      let previousGrid: Uint8Array | null = null;
      for await (const frame of uniqueHoverFrames(track, timestamps(), size, decoderOptions, check)) {
        check();
        const time = source.startSeconds + frame.timestamp;
        if (previous && time - previous.time > 0.1) {
          gpu.reset();
          previousGrid = null;
          previous = null;
        }
        const current = hoverPointAt(input.path, time);
        const grid = gpu.sample(frame.canvas);
        if (grid && detectsCursorHover(grid, previousGrid, previous, current)) {
          addHoverRange(ranges, previous!.time, Math.min(source.startSeconds + source.durationSeconds, time + 0.05));
        }
        previous = current;
        previousGrid = grid?.pixels ?? null;
      }
    } finally {
      gpu?.dispose();
      opened.dispose();
    }
  }
  check();
  return { version: 1, ranges };
}
