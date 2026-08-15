import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingPhase } from './recording-types';

const { capture } = vi.hoisted(() => ({
  capture: {
    platform: 'linux',
    status: vi.fn(),
  },
}));

vi.mock('../../../api/capture', () => ({ capture }));

import { useNativeSystemAudioLevel } from './useNativeSystemAudioLevel';

const useLevel = (options: { enabled?: boolean; phase?: RecordingPhase } = {}) =>
  useNativeSystemAudioLevel(ref(options.enabled ?? true), ref(options.phase ?? 'recording'));

describe('useNativeSystemAudioLevel', () => {
  beforeEach(() => {
    capture.platform = 'linux';
    capture.status.mockReset();
  });

  it('clamps native peaks to the meter range', async () => {
    const meter = useLevel();
    capture.status.mockResolvedValueOnce({ systemAudioLevel: 1.4 }).mockResolvedValueOnce({ systemAudioLevel: -0.2 });

    await meter.refresh();
    expect(meter.level.value).toBe(1);

    await meter.refresh();
    expect(meter.level.value).toBe(0);
  });

  it('clears the level when status polling fails and supports reset', async () => {
    const meter = useLevel();
    capture.status.mockResolvedValueOnce({ systemAudioLevel: 0.65 }).mockRejectedValueOnce(new Error('status failed'));

    await meter.refresh();
    expect(meter.level.value).toBe(0.65);

    await meter.refresh();
    expect(meter.level.value).toBe(0);

    capture.status.mockResolvedValueOnce({ systemAudioLevel: 0.8 });
    await meter.refresh();
    meter.reset();
    expect(meter.level.value).toBe(0);
  });

  it.each([
    { name: 'non-Linux platforms', platform: 'darwin', enabled: true, phase: 'recording' as const },
    { name: 'disabled audio', platform: 'linux', enabled: false, phase: 'recording' as const },
    { name: 'non-recording phases', platform: 'linux', enabled: true, phase: 'paused' as const },
  ])('does not poll for $name', async ({ platform, enabled, phase }) => {
    capture.platform = platform;
    const meter = useLevel({ enabled, phase });

    await meter.refresh();

    expect(capture.status).not.toHaveBeenCalled();
    expect(meter.level.value).toBe(0);
  });

  it('prevents overlapping status requests and allows the next poll after completion', async () => {
    const meter = useLevel();
    let resolveStatus!: (value: { systemAudioLevel: number }) => void;
    const pending = new Promise<{ systemAudioLevel: number }>((resolve) => {
      resolveStatus = resolve;
    });
    capture.status.mockReturnValueOnce(pending).mockResolvedValueOnce({ systemAudioLevel: 0.25 });

    const firstPoll = meter.refresh();
    await meter.refresh();
    expect(capture.status).toHaveBeenCalledTimes(1);

    resolveStatus({ systemAudioLevel: 0.9 });
    await firstPoll;
    expect(meter.level.value).toBe(0.9);

    await meter.refresh();
    expect(capture.status).toHaveBeenCalledTimes(2);
    expect(meter.level.value).toBe(0.25);
  });
});
