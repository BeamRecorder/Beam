import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { RecordingPhase } from './recording-types';
import { createRecordingPause } from './recording-pause';

function context(initial: RecordingPhase = 'recording') {
  const phase = ref(initial);
  const error = ref('');
  const camera = { pause: vi.fn(async () => {}), resume: vi.fn(async () => {}) };
  const audio = { pause: vi.fn(async () => {}), resume: vi.fn(async () => {}) };
  return {
    phase,
    error,
    camera,
    audio,
    sessionId: vi.fn(() => 'session'),
    recorders: () => [camera, audio],
    timelineNowNs: () => 42,
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {
      phase.value = 'idle';
    }),
    clearTimer: vi.fn(),
    startTimer: vi.fn(),
    resetSystemAudioLevel: vi.fn(),
  };
}

describe('recording pause failures', () => {
  it.each(['recording', 'paused'] as const)(
    'finalizes every track after a failed native transition from %s',
    async (phase) => {
      const state = context(phase);
      state[phase === 'recording' ? 'pause' : 'resume'].mockRejectedValueOnce(new Error('Windows encoder stopped'));
      await createRecordingPause(state)();
      expect(state.stop).toHaveBeenCalledOnce();
      expect(state.phase.value).toBe('idle');
      expect(state.error.value).toContain('Windows encoder stopped');
      expect(state.camera[phase === 'recording' ? 'pause' : 'resume']).toHaveBeenCalledOnce();
      expect(state.audio[phase === 'recording' ? 'pause' : 'resume']).toHaveBeenCalledOnce();
    },
  );
  it('waits for the other sidecars to settle before finalizing after an error', async () => {
    const state = context();
    state.pause.mockRejectedValueOnce(new Error('native failed'));
    let release!: () => void;
    state.audio.pause.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const transition = createRecordingPause(state)();
    await vi.waitFor(() => expect(state.audio.pause).toHaveBeenCalledOnce());
    expect(state.stop).not.toHaveBeenCalled();
    release();
    await transition;
    expect(state.stop).toHaveBeenCalledOnce();
  });
  it('handles synchronous sidecar exceptions and rejects concurrent pause clicks', async () => {
    const state = context();
    state.camera.pause.mockImplementationOnce(() => {
      throw new Error('camera lost');
    });
    const toggle = createRecordingPause(state);
    await Promise.all([toggle(), toggle(), toggle()]);
    expect(state.pause).toHaveBeenCalledOnce();
    expect(state.stop).toHaveBeenCalledOnce();
    expect(state.error.value).toContain('camera lost');
  });
  it('never revives the HUD if Stop finishes while a pause is pending', async () => {
    const state = context();
    let release!: () => void;
    state.pause.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const toggle = createRecordingPause(state)();
    await vi.waitFor(() => expect(state.pause).toHaveBeenCalledOnce());
    state.phase.value = 'idle';
    release();
    await toggle;
    expect(state.phase.value).toBe('idle');
    expect(state.clearTimer).not.toHaveBeenCalled();
    expect(state.startTimer).not.toHaveBeenCalled();
  });
  it('keeps the lifecycle consistent across repeated pauses and resumes', async () => {
    const state = context();
    const toggle = createRecordingPause(state);
    for (let cycle = 0; cycle < 256; cycle += 1) {
      await toggle();
      expect(state.phase.value).toBe('paused');
      await toggle();
      expect(state.phase.value).toBe('recording');
    }
    expect(state.pause).toHaveBeenCalledTimes(256);
    expect(state.resume).toHaveBeenCalledTimes(256);
    expect(state.stop).not.toHaveBeenCalled();
  });
});
