import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playScreenshotSound } from '../screenshot-sound';
import { resolvePublicAssetUrl } from '../public-asset';

describe('screenshot confirmation sound', () => {
  let audio: HTMLAudioElement;
  let createAudio: ReturnType<typeof vi.fn>;
  let warning: ReturnType<typeof vi.spyOn>;
  let schedule: ReturnType<typeof vi.spyOn>;
  let cancel: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    audio = document.createElement('audio');
    vi.spyOn(audio, 'play').mockResolvedValue(undefined);
    vi.spyOn(audio, 'pause').mockImplementation(() => {});
    vi.spyOn(audio, 'load').mockImplementation(() => {});
    createAudio = vi.fn(function () {
      return audio;
    });
    vi.stubGlobal('Audio', createAudio);
    warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    schedule = vi.spyOn(globalThis, 'setTimeout');
    cancel = vi.spyOn(globalThis, 'clearTimeout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const expectReleased = () => {
    expect(audio.onended).toBeNull();
    expect(audio.onerror).toBeNull();
    expect(audio.hasAttribute('src')).toBe(false);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.load).toHaveBeenCalledOnce();
    const timeoutCall = schedule.mock.calls.findIndex(([, delay]: unknown[]) => delay === 1_500);
    expect(cancel).toHaveBeenCalledWith(schedule.mock.results[timeoutCall]!.value);
  };

  it('plays the bundled shutter once at 100% and waits until it ends', async () => {
    const completed = vi.fn();
    const playback = playScreenshotSound().then(completed);
    expect(createAudio).toHaveBeenCalledExactlyOnceWith(resolvePublicAssetUrl('sounds/screenshot-click.wav'));
    expect(audio.volume).toBe(1);
    expect(audio.loop).toBe(false);
    expect(audio.play).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    audio.dispatchEvent(new Event('ended'));
    await playback;

    expect(completed).toHaveBeenCalledOnce();
    expect(warning).not.toHaveBeenCalled();
    expectReleased();
  });

  it.each(['rejected', 'thrown'] as const)('keeps the screenshot successful when playback is %s', async (kind) => {
    const error = new Error('Audio device unavailable');
    if (kind === 'rejected') vi.mocked(audio.play).mockRejectedValueOnce(error);
    else
      vi.mocked(audio.play).mockImplementationOnce(() => {
        throw error;
      });

    await expect(playScreenshotSound()).resolves.toBeUndefined();

    expect(warning).toHaveBeenCalledWith('Screenshot confirmation sound could not play.', error);
    expectReleased();
  });

  it('reports a decoding error and releases the audio', async () => {
    const playback = playScreenshotSound();
    audio.dispatchEvent(new Event('error'));
    await expect(playback).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith(expect.any(String), new Error('Screenshot sound could not be decoded.'));
    expectReleased();
  });

  it('bounds stalled playback so renderer cleanup can finish', async () => {
    vi.mocked(audio.play).mockReturnValue(new Promise(() => {}));
    const playback = playScreenshotSound();
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(playback).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith(expect.any(String), new Error('Screenshot sound playback timed out.'));
    expectReleased();
  });

  it('does not fail capture if the audio element cannot be created', async () => {
    createAudio.mockImplementationOnce(function () {
      throw new Error('Audio unavailable');
    });
    await expect(playScreenshotSound()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
    expect(audio.play).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
