import { tNamespace } from '../../../i18n';
import type { RecordingPauseContext } from './recording-pause-types';

const t = tNamespace('RecordingHealth');

export function createRecordingPause(context: RecordingPauseContext) {
  let pending = false;
  return async () => {
    const sessionId = context.sessionId();
    const phase = context.phase.value;
    if (pending || !sessionId || (phase !== 'recording' && phase !== 'paused')) return;
    pending = true;
    try {
      const pauseNs = context.timelineNowNs();
      const results = await Promise.allSettled([
        Promise.resolve().then(() => (phase === 'recording' ? context.pause() : context.resume())),
        ...context
          .recorders()
          .map((recorder) =>
            Promise.resolve().then(() =>
              phase === 'recording' ? recorder?.pause(pauseNs) : recorder?.resume(sessionId),
            ),
          ),
      ]);
      if (context.sessionId() !== sessionId || context.phase.value !== phase) return;
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        const reason = failures
          .map((failure) => (failure.reason instanceof Error ? failure.reason.message : String(failure.reason)))
          .join(' · ');
        // Every sidecar has settled before Stop: a rejected native pause must
        // never leave a recording HUD over tracks which were already closed.
        await context.stop();
        context.error.value = t('transitionFailed', { reason });
        return;
      }
      if (phase === 'recording') {
        context.clearTimer();
        context.phase.value = 'paused';
        context.resetSystemAudioLevel();
      } else {
        context.startTimer();
        context.phase.value = 'recording';
      }
    } finally {
      pending = false;
    }
  };
}
