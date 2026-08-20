import type { Ref } from 'vue';
import { capture } from '../../../api/capture';
import { BrowserSystemAudioRecorder } from '../../../api/system-audio-recorder';
import { isRecordingActivePhase, type RecordingPhase } from './recording-types';

export function useRecordingHealth(
  phase: Ref<RecordingPhase>,
  error: Ref<string>,
  getRecorder: () => BrowserSystemAudioRecorder | null,
  cancel: () => Promise<void>,
  stop: () => Promise<void>,
) {
  let timer: number | null = null;
  let polling = false;
  let generation = 0;
  let failureHandled = false;

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
      if (status.screenAvailable === false) handleFailure('Screen sharing ended.');
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
    timer = window.setInterval(() => void check(), 250);
    void check();
  };

  const reset = () => {
    generation += 1;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    failureHandled = false;
  };

  return { registerSystemAudioRecorder, start, reset };
}
