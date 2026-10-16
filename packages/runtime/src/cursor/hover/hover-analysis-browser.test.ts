import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeCursorHoversInBackground } from './hover-analysis-browser';
const state = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), analyze: vi.fn(), worker: vi.fn() }));
vi.mock('./hover-analysis.worker?worker', () => ({
  default: class {
    constructor() {
      state.worker();
    }
  },
}));
vi.mock('./hover-worker-client', () => ({ analyzeHoversInWorker: state.analyze }));
vi.mock('./hover-analysis-cache', () => ({
  hoverCacheKey: vi.fn(async () => 'key'),
  readHoverCache: state.read,
  writeHoverCache: state.write,
}));
const sync = { version: 1, ranges: [] };
beforeEach(() => {
  vi.clearAllMocks();
  state.read.mockResolvedValue(undefined);
  state.write.mockResolvedValue(undefined);
  state.analyze.mockImplementation(async (_input, _signal, create) => {
    create();
    return sync;
  });
});
describe('background hover analysis', () => {
  it('returns cached results without opening a worker', async () => {
    state.read.mockResolvedValue(sync);
    expect(
      await analyzeCursorHoversInBackground({ sources: [], path: new Float64Array() }, new AbortController().signal),
    ).toEqual(sync);
    expect(state.worker).not.toHaveBeenCalled();
  });
  it('runs and caches actual worker results on a miss', async () => {
    expect(
      await analyzeCursorHoversInBackground({ sources: [], path: new Float64Array() }, new AbortController().signal),
    ).toEqual(sync);
    expect(state.worker).toHaveBeenCalledOnce();
    expect(state.write).toHaveBeenCalledWith('key', sync);
  });
  it('rejects invalid input and aborted requests before starting a worker', async () => {
    await expect(
      analyzeCursorHoversInBackground({ sources: [], path: new Float64Array([1]) }, new AbortController().signal),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzeCursorHoversInBackground({ sources: [], path: new Float64Array() }, controller.signal),
    ).rejects.toThrow();
    expect(state.analyze).not.toHaveBeenCalled();
  });
  it('does not publish a result when cancelled during cache lookup or storage', async () => {
    for (const stage of ['read', 'write'] as const) {
      const controller = new AbortController();
      state[stage].mockImplementationOnce(async () => {
        controller.abort();
      });
      await expect(
        analyzeCursorHoversInBackground({ sources: [], path: new Float64Array() }, controller.signal),
      ).rejects.toThrow();
    }
  });
});
