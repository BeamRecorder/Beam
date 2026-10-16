import { analyzeCursorHovers } from './hover-analysis';
import type { HoverAnalysisInput, HoverWorkerReply } from './hover-types';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<HoverAnalysisInput>) => void) | null;
  postMessage: (reply: HoverWorkerReply) => void;
};
scope.onmessage = async ({ data }) => {
  let lastProgress = -Infinity;
  try {
    const sync = await analyzeCursorHovers(data, new AbortController().signal, () => {
      if (performance.now() - lastProgress < 500) return;
      lastProgress = performance.now();
      scope.postMessage({ type: 'progress' });
    });
    scope.postMessage({ type: 'complete', sync });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
