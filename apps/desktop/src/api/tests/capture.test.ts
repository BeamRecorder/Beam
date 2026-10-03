import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopCaptureApi } from '../types/capture-api';

const previousCapture = window.capture;

afterEach(() => {
  vi.resetModules();
  if (previousCapture) {
    window.capture = previousCapture;
  } else {
    delete window.capture;
  }
});

describe('capture preload bridge', () => {
  it('fails clearly when the Electron preload did not expose the bridge', async () => {
    delete window.capture;
    vi.resetModules();

    await expect(import('../capture')).rejects.toThrow('Capture API indisponible');
  });

  it('returns the exact API exposed by the preload', async () => {
    const exposed = { discover: vi.fn() } as unknown as DesktopCaptureApi;
    window.capture = exposed;
    vi.resetModules();

    const module = await import('../capture');

    expect(module.capture).toBe(exposed);
  });
});
