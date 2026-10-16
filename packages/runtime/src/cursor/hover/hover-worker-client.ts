import { validateCursorHoverSync } from '@beam/engine/cursor/cursor-hover-sync';
import type { CursorHoverSync } from '@beam/engine/cursor/cursor-hover-types';
import type { HoverAnalysisInput, HoverWorkerReply } from './hover-types';

/** An unresponsive decoder cannot keep an editor or export pending indefinitely. */
export function analyzeHoversInWorker(
  input: HoverAnalysisInput,
  signal: AbortSignal,
  create: () => Worker,
): Promise<CursorHoverSync> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = create();
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (error?: unknown, sync?: CursorHoverSync) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      if (error !== undefined) reject(error);
      else resolve(sync!);
    };
    const abort = () => finish(signal.reason);
    const heartbeat = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new Error('Cursor synchronization decoder timed out.')), 30_000);
    };
    worker.onmessage = ({ data }: MessageEvent<HoverWorkerReply>) => {
      try {
        if (data?.type === 'progress') heartbeat();
        else if (data?.type === 'complete') {
          validateCursorHoverSync(data.sync);
          finish(undefined, data.sync);
        } else if (data?.type === 'error') finish(new Error(data.message));
        else finish(new Error('Invalid cursor synchronization worker response.'));
      } catch (error) {
        finish(error);
      }
    };
    worker.onerror = (event) => finish(new Error(event.message || 'Cursor synchronization worker failed.'));
    worker.onmessageerror = () => finish(new Error('Cursor synchronization worker message failed.'));
    signal.addEventListener('abort', abort, { once: true });
    heartbeat();
    try {
      worker.postMessage(input, [input.path.buffer]);
    } catch (error) {
      finish(error);
    }
  });
}
