import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecordingFinalizationStatus } from './useRecordingFinalizationStatus';
import type { RecordingPhase } from './recording-types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(platform = 'win32', initial: RecordingPhase = 'finalizing') {
  const scope = effectScope();
  const phase = ref<RecordingPhase>(initial);
  const status = scope.run(() =>
    useRecordingFinalizationStatus(
      () => phase.value,
      () => platform,
    ),
  )!;
  return { scope, phase, ...status };
}

describe('recording finalization status', () => {
  it('explains the Windows wait at 15 seconds, without reporting completion at 60 seconds', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(state.takingLonger.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.takingLonger.value).toBe(true);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(state.takingLonger.value).toBe(true);
    state.scope.stop();
  });

  it('resets after completion, cancellation or a new take', async () => {
    const state = setup();
    await vi.advanceTimersByTimeAsync(15_000);
    state.phase.value = 'idle';
    await vi.advanceTimersByTimeAsync(0);
    expect(state.takingLonger.value).toBe(false);
    state.phase.value = 'finalizing';
    await vi.advanceTimersByTimeAsync(14_999);
    expect(state.takingLonger.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.takingLonger.value).toBe(true);
    state.scope.stop();
  });

  it('clears pending work when finalization finishes early or the component unmounts', async () => {
    const state = setup();
    state.phase.value = 'recording';
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    state.phase.value = 'finalizing';
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    state.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['linux', 'darwin', ''])('does not claim the Windows deadline on %s', async (platform) => {
    const state = setup(platform);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.takingLonger.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    state.scope.stop();
  });

  it.each(['idle', 'countdown', 'starting', 'recording', 'paused'] as const)(
    'does not start an idle timer during %s',
    async (phase) => {
      const state = setup('win32', phase);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(state.takingLonger.value).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      state.scope.stop();
    },
  );
});
