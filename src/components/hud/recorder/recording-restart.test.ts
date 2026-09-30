import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createRecordingRestart } from './recording-restart';
import type { RecordingConfiguration, RecordingPhase } from './recording-types';

const configuration: RecordingConfiguration = {
  screenKind: 'display',
  screenId: 'screen-1',
  cameraId: 'off',
  microphoneId: 'default',
  systemAudio: true,
  targetFps: 60,
  countdownSeconds: 3,
  recordingBarVisibility: 'always',
  region: { x: 0, y: 0, width: 1, height: 1 },
};
const fixture = (initial: RecordingPhase = 'recording') => {
  const phase = ref<RecordingPhase>(initial);
  const cancel = vi.fn(async () => {
    phase.value = 'idle';
  });
  const start = vi.fn(async () => {
    phase.value = 'recording';
  });
  return { phase, cancel, start, restart: createRecordingRestart(phase, () => configuration, cancel, start) };
};
describe('recording restart', () => {
  it.each(['recording', 'paused'] as const)(
    'discards %s before restarting with the same configuration and no countdown',
    async (phase) => {
      const f = fixture(phase);
      await f.restart();
      expect(f.cancel).toHaveBeenCalledOnce();
      expect(f.start).toHaveBeenCalledWith({ ...configuration, countdownSeconds: 0 });
      expect(f.cancel.mock.invocationCallOrder[0]).toBeLessThan(f.start.mock.invocationCallOrder[0]!);
      expect(configuration.countdownSeconds).toBe(3);
    },
  );
  it.each(['idle', 'starting', 'countdown', 'finalizing'] as const)('ignores restart during %s', async (phase) => {
    const f = fixture(phase);
    await f.restart();
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it('does not restart without a configuration or when cleanup leaves recording active', async () => {
    const f = fixture();
    await createRecordingRestart(f.phase, () => null, f.cancel, f.start)();
    expect(f.cancel).not.toHaveBeenCalled();
    f.cancel.mockImplementation(async () => {});
    await f.restart();
    expect(f.start).not.toHaveBeenCalled();
  });
  it('rejects cleanup failure and permits a later successful retry', async () => {
    const f = fixture();
    f.cancel.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(f.restart()).rejects.toThrow('cleanup failed');
    expect(f.start).not.toHaveBeenCalled();
    await f.restart();
    expect(f.start).toHaveBeenCalledOnce();
  });
  it('coalesces concurrent clicks while discard is unresolved', async () => {
    const f = fixture();
    let finish!: () => void;
    f.cancel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            f.phase.value = 'idle';
            resolve();
          };
        }),
    );
    const pending = f.restart();
    await f.restart();
    expect(f.cancel).toHaveBeenCalledOnce();
    finish();
    await pending;
    expect(f.start).toHaveBeenCalledOnce();
  });
});
