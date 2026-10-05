import { withMediaDeadline } from '../../../api/media-recorder-finalization';
import type { RecordingStopOperations, RecordingStopResult } from './recording-stop-types';

export async function finalizeRecording(operations: RecordingStopOperations): Promise<RecordingStopResult> {
  const [native, sidecars] = await Promise.allSettled([
    Promise.resolve().then(() => operations.stopNative()),
    Promise.resolve().then(() => operations.stopSidecars()),
  ]);
  const warning = sidecars.status === 'rejected' ? message(sidecars.reason) : '';
  let failure: unknown;
  try {
    if (native.status === 'rejected') throw native.reason;
    return { kind: 'completed', session: await operations.completeNative(), warning };
  } catch (error) {
    failure = error;
  }
  // The native process may have finalized successfully, or have been killed
  // after a timeout. Never restart the UI counter for a nonexistent recording.
  try {
    const status = await withMediaDeadline(operations.status(), 'Recording status', 5_000);
    if (['recording', 'degraded', 'paused'].includes(status.state)) return { kind: 'active', error: message(failure) };
    if (status.state === 'completed' && status.manifestPath) {
      try {
        return { kind: 'completed', session: await operations.completeNative(), warning };
      } catch (error) {
        return { kind: 'failed', error: message(error), cleanupBlocked: true };
      }
    }
    return { kind: 'failed', error: message(failure), cleanupBlocked: false };
  } catch {
    return { kind: 'failed', error: message(failure), cleanupBlocked: true };
  }
}

function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
