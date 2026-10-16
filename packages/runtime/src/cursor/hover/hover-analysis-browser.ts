import HoverWorker from './hover-analysis.worker?worker';
import { analyzeHoversInWorker } from './hover-worker-client';
import type { HoverAnalysisInput } from './hover-types';
import { hoverCacheKey, readHoverCache, writeHoverCache } from './hover-analysis-cache';
import { validateHoverInput } from './hover-input';

export async function analyzeCursorHoversInBackground(input: HoverAnalysisInput, signal: AbortSignal) {
  validateHoverInput(input);
  signal.throwIfAborted();
  const key = await hoverCacheKey(input);
  const cached = await readHoverCache(key);
  signal.throwIfAborted();
  if (cached) return cached;
  const sync = await analyzeHoversInWorker(input, signal, () => new HoverWorker());
  await writeHoverCache(key, sync);
  signal.throwIfAborted();
  return sync;
}
