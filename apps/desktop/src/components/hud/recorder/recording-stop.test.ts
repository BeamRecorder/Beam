import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeRecording } from './recording-stop';
import type { CaptureState } from '../../../api/types/capture-api';
import type { CaptureSession } from '../../../api/types/capture-api';

const operations = () => ({
  stopNative: vi.fn(async () => ({ state: 'completed' as const })),
  stopSidecars: vi.fn(async (): Promise<void> => undefined),
  completeNative: vi.fn(async (): Promise<CaptureSession> => ({
    state: 'completed',
    manifestPath: '/session/manifest.json',
  })),
  status: vi.fn(async () => ({ state: 'idle' as CaptureState, manifestPath: null as string | null })),
});
afterEach(() => vi.useRealTimers());

describe('terminal recording stop', () => {
  it.each([false, true])('does not open a failed empty recording after stop recovery=%s', async (recovery) => {
    const calls = operations();
    if (recovery) {
      calls.stopNative.mockRejectedValue(new Error('source failed'));
      calls.status.mockResolvedValue({ state: 'completed', manifestPath: '/session/manifest.json' });
    }
    calls.completeNative.mockResolvedValue({
      state: 'completed',
      screenAvailable: false,
      screenMediaAvailable: false,
      videoSrc: null,
      screenCaptureError: '0xC00D6D60: type not set',
    });
    expect(await finalizeRecording(calls)).toEqual({
      kind: 'failed',
      error: '0xC00D6D60: type not set',
      cleanupBlocked: false,
    });
    expect(calls.completeNative).toHaveBeenCalledTimes(1);
  });
  it('uses the existing translated capture error if empty output has no native diagnostic', async () => {
    const calls = operations();
    calls.completeNative.mockResolvedValue({ state: 'completed', screenAvailable: false, screenMediaAvailable: false });
    const result = await finalizeRecording(calls);
    expect(result).toMatchObject({ kind: 'failed', cleanupBlocked: false });
    if (result.kind === 'failed') expect(result.error).toBeTruthy();
  });
  it('still opens playable partial media even if the native screen track failed later', async () => {
    const calls = operations();
    calls.completeNative.mockResolvedValue({
      state: 'completed',
      screenAvailable: false,
      screenMediaAvailable: true,
      videoSrc: 'file:///screen.mp4',
      screenCaptureError: 'source disappeared',
    });
    expect(await finalizeRecording(calls)).toMatchObject({
      kind: 'completed',
      session: { videoSrc: 'file:///screen.mp4' },
    });
  });
  it('allows camera/audio-only sessions with no native screen track', async () => {
    const calls = operations();
    calls.completeNative.mockResolvedValue({ state: 'completed', screenAvailable: false });
    expect(await finalizeRecording(calls)).toMatchObject({ kind: 'completed' });
  });
  it('waits for sidecars before publishing the completed native session', async () => {
    const calls = operations();
    let release!: () => void;
    calls.stopSidecars.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const finished = finalizeRecording(calls);
    await Promise.resolve();
    expect(calls.completeNative).not.toHaveBeenCalled();
    release();
    expect((await finished).kind).toBe('completed');
    expect(calls.status).not.toHaveBeenCalled();
  });
  it('keeps screen media available when an optional track fails', async () => {
    const calls = operations();
    calls.stopSidecars.mockRejectedValue(new Error('camera disconnected'));
    expect(await finalizeRecording(calls)).toMatchObject({ kind: 'completed', warning: 'camera disconnected' });
  });
  it.each(['recording', 'degraded', 'paused'] as const)(
    'only restores an actually active native state: %s',
    async (state) => {
      const calls = operations();
      calls.stopNative.mockRejectedValue(new Error('stop failed'));
      calls.status.mockResolvedValue({ state, manifestPath: null });
      expect(await finalizeRecording(calls)).toEqual({ kind: 'active', error: 'stop failed' });
    },
  );
  it.each(['idle', 'failed', 'recoverable', 'completed'] as const)(
    'does not restart the timer for a terminal native state: %s',
    async (state) => {
      const calls = operations();
      calls.stopNative.mockRejectedValue('engine terminated');
      calls.status.mockResolvedValue({ state, manifestPath: null });
      expect(await finalizeRecording(calls)).toEqual({
        kind: 'failed',
        error: 'engine terminated',
        cleanupBlocked: false,
      });
    },
  );
  it('recovers a native manifest after the stop response failed', async () => {
    const calls = operations();
    calls.stopNative.mockRejectedValue(new Error('source closed'));
    calls.status.mockResolvedValue({ state: 'completed', manifestPath: '/session/manifest.json' });
    expect((await finalizeRecording(calls)).kind).toBe('completed');
  });
  it('retries sidecar manifest publication after an initial completion error', async () => {
    const calls = operations();
    calls.completeNative.mockRejectedValueOnce(new Error('temporary IO error'));
    calls.status.mockResolvedValue({ state: 'completed', manifestPath: '/session/manifest.json' });
    expect((await finalizeRecording(calls)).kind).toBe('completed');
    expect(calls.completeNative).toHaveBeenCalledTimes(2);
  });
  it('reports publication errors while leaving the completed recording stopped', async () => {
    const calls = operations();
    calls.completeNative.mockRejectedValue(new Error('disk full'));
    calls.status.mockResolvedValue({ state: 'completed', manifestPath: '/session/manifest.json' });
    expect(await finalizeRecording(calls)).toEqual({ kind: 'failed', error: 'disk full', cleanupBlocked: true });
  });
  it('does not claim the native process is active when status also fails', async () => {
    const calls = operations();
    calls.stopNative.mockRejectedValue(new Error('engine crashed'));
    calls.status.mockRejectedValue(new Error('transport closed'));
    expect(await finalizeRecording(calls)).toEqual({ kind: 'failed', error: 'engine crashed', cleanupBlocked: true });
  });
  it('bounds a status response from a frozen engine', async () => {
    vi.useFakeTimers();
    const calls = operations();
    calls.stopNative.mockRejectedValue(new Error('engine crashed'));
    calls.status.mockReturnValue(new Promise(() => undefined));
    const finished = finalizeRecording(calls);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await finished).toEqual({ kind: 'failed', error: 'engine crashed', cleanupBlocked: true });
  });
});
