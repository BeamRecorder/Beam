import { afterEach, describe, expect, it, vi } from 'vitest';
import { enumerateBrowserMediaDevices } from '../browser-media-devices';
import { listBrowserCameras } from '../camera-recorder';
import { listBrowserMicrophones } from '../microphone-recorder';

const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
afterEach(() => {
  if (original) Object.defineProperty(navigator, 'mediaDevices', original);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('browser device discovery', () => {
  it('shares concurrent lists without opening a camera or microphone for labels', async () => {
    const getUserMedia = vi.fn();
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic', label: '' },
      { kind: 'videoinput', deviceId: 'cam', label: '' },
    ]);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices, getUserMedia },
    });
    const [microphones, cameras] = await Promise.all([listBrowserMicrophones(), listBrowserCameras()]);
    expect(enumerateDevices).toHaveBeenCalledOnce();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(microphones[0]?.id).toBe('microphone:chromium:mic');
    expect(cameras[0]?.id).toBe('camera:chromium:cam');

    enumerateDevices.mockResolvedValue([]);
    await expect(enumerateBrowserMediaDevices()).resolves.toEqual([]);
    expect(enumerateDevices).toHaveBeenCalledTimes(2);
  });

  it('retries after a shared failure and reports missing Chromium support', async () => {
    const enumerateDevices = vi.fn().mockRejectedValueOnce(new Error('device service unavailable'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices } });
    const results = await Promise.allSettled([listBrowserMicrophones(), listBrowserCameras()]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(enumerateDevices).toHaveBeenCalledOnce();
    enumerateDevices.mockResolvedValue([]);
    await expect(enumerateBrowserMediaDevices()).resolves.toEqual([]);

    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await expect(enumerateBrowserMediaDevices()).rejects.toThrow('Media device discovery is unavailable');
  });
});
