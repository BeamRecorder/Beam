import type { Ref } from 'vue';
import { capture } from '../../../api/capture';
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder';
import { tNamespace } from '../../../i18n';
import { isRecordingActivePhase, type RecordingPhase } from './recording-types';

export function useRecordingHealth(
  phase: Ref<RecordingPhase>,
  error: Ref<string>,
  getRecorder: () => BrowserSystemAudioRecorder | null,
  cancel: () => Promise<void>,
  stop: () => Promise<void>,
) {
  const t = tNamespace('RecordingHealth');
  let timer: number | null = null;
  let polling = false;
  let generation = 0;
  let failureHandled = false;
  let inputFailureHandled = false;

  const handleFailure = (message: string) => {
    if (failureHandled || phase.value === 'idle' || phase.value === 'finalizing') return;
    failureHandled = true;
    error.value = message;
    if (phase.value === 'countdown' || phase.value === 'starting') void cancel();
    else if (phase.value === 'recording' || phase.value === 'paused') void stop();
  };

  const registerSystemAudioRecorder = (recorder: BrowserSystemAudioRecorder) => {
    recorder.onFatal((reason) => {
      if (getRecorder() === recorder) handleFailure(reason.message);
    });
  };

  const check = async () => {
    if (polling || !isRecordingActivePhase(phase.value)) return;
    const currentGeneration = generation;
    polling = true;
    try {
      const status = await capture.status();
      if (currentGeneration !== generation) return;
      if (
        status.screenAvailable === false ||
        (['recording', 'paused'].includes(phase.value) &&
          ['idle', 'failed', 'recoverable', 'completed'].includes(status.state))
      ) {
        handleFailure(status.screenCaptureError || t('captureStopped'));
      } else if (status.inputCaptureError && !inputFailureHandled) {
        inputFailureHandled = true;
        error.value = status.inputCaptureError.message;
      }
    } catch {
      // A transient status failure must not interrupt an otherwise healthy recording.
    } finally {
      polling = false;
    }
  };

  const start = () => {
    if (timer !== null) return;
    generation += 1;
    failureHandled = false;
    inputFailureHandled = false;
    timer = window.setInterval(() => void check(), 250);
    void check();
  };

  const reset = () => {
    generation += 1;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    failureHandled = false;
    inputFailureHandled = false;
  };

  return { registerSystemAudioRecorder, start, reset };
}
