import type { Ref } from 'vue';
import type { RecordingConfiguration, RecordingPhase } from './recording-types';

export function createRecordingRestart(
  phase: Readonly<Ref<RecordingPhase>>,
  configuration: () => RecordingConfiguration | null,
  cancel: () => Promise<void>,
  start: (configuration: RecordingConfiguration) => Promise<void>,
) {
  let pending = false;
  return async () => {
    if (pending || !['recording', 'paused'].includes(phase.value)) return;
    const current = configuration();
    if (!current) return;
    pending = true;
    try {
      await cancel();
      if (phase.value === 'idle') await start({ ...current, countdownSeconds: 0 });
    } finally {
      pending = false;
    }
  };
}
