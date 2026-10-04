import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureSession } from '~/api/types/capture-api';
import type { BrowserSystemAudioRecorder } from '~/api/system-audio-recorder';
import type { RecordingPhase } from './recording-types';
import { useRecordingHealth } from './useRecordingHealth';

const capture = vi.hoisted(() => ({ status: vi.fn<() => Promise<CaptureSession>>() }));
vi.mock('../../../api/capture', () => ({ capture }));

const inputFailure = {
  code: 'input-stream-stalled',
  message: 'Interaction capture stopped. Automatic zooms may be incomplete.',
};
const resets: Array<() => void> = [];
function healthFor(initial: RecordingPhase = 'recording') {
  const phase = ref<RecordingPhase>(initial);
  const error = ref('');
  const cancel = vi.fn(async () => {});
  const stop = vi.fn(async () => {});
  const getRecorder = vi.fn<() => BrowserSystemAudioRecorder | null>(() => null);
  const health = useRecordingHealth(phase, error, getRecorder, cancel, stop);
  resets.push(health.reset);
  return { health, phase, error, cancel, stop, getRecorder };
}

beforeEach(() => {
  vi.useFakeTimers();
  capture.status.mockReset().mockResolvedValue({ state: 'recording', screenAvailable: true, inputCaptureError: null });
});
afterEach(() => {
  resets.splice(0).forEach((reset) => reset());
  vi.useRealTimers();
});

describe('recording health', () => {
  it.each(['recording', 'paused'] as const)(
    'shows lost input access while %s and keeps the video running',
    async (phase) => {
      capture.status.mockResolvedValue({ state: phase, screenAvailable: true, inputCaptureError: inputFailure });
      const state = healthFor(phase);
      state.health.start();
      await vi.advanceTimersByTimeAsync(300);
      expect(state.error.value).toBe(inputFailure.message);
      expect(state.phase.value).toBe(phase);
      expect(state.stop).not.toHaveBeenCalled();
      expect(state.cancel).not.toHaveBeenCalled();
    },
  );

  it('allows idle periods without input events for an otherwise healthy recording', async () => {
    const state = healthFor();
    state.health.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.error.value).toBe('');
    expect(state.stop).not.toHaveBeenCalled();
  });

  it('retains an input warning if later status no longer includes it', async () => {
    capture.status.mockResolvedValueOnce({ state: 'recording', inputCaptureError: inputFailure });
    const state = healthFor();
    state.health.start();
    await vi.advanceTimersByTimeAsync(600);
    expect(state.error.value).toBe(inputFailure.message);
  });

  it('does not repeatedly overwrite other diagnostics with the same input failure', async () => {
    capture.status.mockResolvedValue({ state: 'recording', inputCaptureError: inputFailure });
    const state = healthFor();
    state.health.start();
    await vi.advanceTimersByTimeAsync(250);
    state.error.value = 'Camera recording stopped.';
    await vi.advanceTimersByTimeAsync(500);
    expect(state.error.value).toBe('Camera recording stopped.');
  });

  it('restores input failure reporting when a new recording starts', async () => {
    capture.status.mockResolvedValue({ state: 'recording', inputCaptureError: inputFailure });
    const state = healthFor();
    state.health.start();
    await vi.advanceTimersByTimeAsync(250);
    state.health.reset();
    state.error.value = '';
    state.health.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(state.error.value).toBe(inputFailure.message);
  });

  it('ignores transient native status failures', async () => {
    capture.status.mockRejectedValueOnce(new Error('Temporary transport failure'));
    const state = healthFor();
    state.health.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(state.error.value).toBe('');
    expect(state.stop).not.toHaveBeenCalled();
  });

  it('deduplicates the polling timer and pending requests', async () => {
    let resolve!: (status: CaptureSession) => void;
    capture.status.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const state = healthFor();
    state.health.start();
    state.health.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture.status).toHaveBeenCalledOnce();
    resolve({ state: 'recording' });
    await vi.advanceTimersByTimeAsync(250);
    expect(capture.status).toHaveBeenCalledTimes(2);
  });

  it('ignores late failures after the recording health monitor is reset', async () => {
    let resolve!: (status: CaptureSession) => void;
    capture.status.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const state = healthFor();
    state.health.start();
    state.health.reset();
    resolve({ state: 'recording', inputCaptureError: inputFailure });
    await Promise.resolve();
    expect(state.error.value).toBe('');
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture.status).toHaveBeenCalledOnce();
  });

  it('does not poll inactive recordings', async () => {
    const state = healthFor('idle');
    state.health.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(capture.status).not.toHaveBeenCalled();
  });

  it('stops video once when screen sharing ends even after an input failure', async () => {
    capture.status.mockResolvedValue({ state: 'recording', screenAvailable: false, inputCaptureError: inputFailure });
    const state = healthFor();
    state.health.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.stop).toHaveBeenCalledOnce();
    expect(state.error.value).toBe('Screen sharing ended.');
  });

  it.each(['countdown', 'starting'] as const)('cancels unavailable screen sharing during %s', async (phase) => {
    capture.status.mockResolvedValue({ state: 'recording', screenAvailable: false });
    const state = healthFor(phase);
    state.health.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.stop).not.toHaveBeenCalled();
  });

  it('only accepts fatal browser audio failures from the active recorder', async () => {
    const state = healthFor();
    let fatal!: (error: Error) => void;
    const recorder = {
      onFatal: (listener: typeof fatal) => {
        fatal = listener;
      },
    } as unknown as BrowserSystemAudioRecorder;
    state.health.registerSystemAudioRecorder(recorder);
    fatal(new Error('Stale recorder'));
    expect(state.error.value).toBe('');
    state.getRecorder.mockReturnValue(recorder);
    fatal(new Error('Audio stream stopped'));
    expect(state.error.value).toBe('Audio stream stopped');
    expect(state.stop).toHaveBeenCalledOnce();
    state.health.reset();
    state.phase.value = 'finalizing';
    fatal(new Error('Already finalizing'));
    expect(state.stop).toHaveBeenCalledOnce();
  });
});
