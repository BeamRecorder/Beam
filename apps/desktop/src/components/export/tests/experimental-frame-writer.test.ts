import { describe, expect, it, vi } from 'vitest';
import { AudioSample } from 'mediabunny';
import { createGpuExportWriter } from '../experimental-frame-writer';
import type { ExperimentalGpuExportApi } from '../experimental-export-types';
const fixture = () => {
  const api = {
    prepareFrame: vi.fn().mockResolvedValue(undefined),
    frame: vi.fn().mockResolvedValue(undefined),
    audio: vi.fn().mockResolvedValue(undefined),
  };
  const present = vi.fn().mockResolvedValue(undefined);
  return { api, present, writer: createGpuExportWriter(api as unknown as ExperimentalGpuExportApi, present) };
};
const sample = (channels = 2, rate = 48000) =>
  new AudioSample({
    data: new Float32Array(channels * 8),
    format: 'f32',
    numberOfChannels: channels,
    sampleRate: rate,
    timestamp: 0.5,
  });
describe('experimental GPU frame writer', () => {
  it('measures compositor presentation separately from the native acknowledgement wait', async () => {
    const { api, present } = fixture();
    const measured = vi.fn();
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(121);
    try {
      const writer = createGpuExportWriter(api as unknown as ExperimentalGpuExportApi, present, measured);
      await writer.prepareVideo!(0);
      await writer.addVideo(0, 1);
      expect(measured).toHaveBeenCalledWith(21);
      expect(measured.mock.invocationCallOrder[0]).toBeLessThan(api.frame.mock.invocationCallOrder[0]!);
    } finally {
      clock.mockRestore();
    }
  });
  it('prepares, presents and acknowledges each frame in order', async () => {
    const { writer, api, present } = fixture();
    for (let frame = 0; frame < 3; frame++) {
      await writer.prepareVideo!(frame);
      await writer.addVideo(frame / 30, 1 / 30);
    }
    expect(api.prepareFrame.mock.calls).toEqual([[0], [1], [2]]);
    expect(api.frame.mock.calls).toEqual([[0], [1], [2]]);
    expect(present).toHaveBeenCalledTimes(3);
    expect(present.mock.invocationCallOrder[0]).toBeLessThan(api.frame.mock.invocationCallOrder[0]!);
    writer.closeVideo();
    await expect(writer.addVideo(0, 1)).rejects.toThrow('not prepared');
    await expect(writer.prepareVideo!(3)).rejects.toThrow('preparation');
  });
  it('rejects unprepared or unordered frames and preserves sequence after native failure', async () => {
    const { writer, api } = fixture();
    await expect(writer.addVideo(0, 1)).rejects.toThrow('not prepared');
    await expect(writer.prepareVideo!(1)).rejects.toThrow('preparation');
    await writer.prepareVideo!(0);
    await expect(writer.prepareVideo!(0)).rejects.toThrow('preparation');
    api.frame.mockRejectedValueOnce(new Error('GPU lost'));
    await expect(writer.addVideo(0, 1)).rejects.toThrow('GPU lost');
    await writer.addVideo(0, 1);
    expect(api.frame.mock.calls).toEqual([[0], [0]]);
    await writer.prepareVideo!(1);
  });
  it('waits for two animation frames with the default presentation scheduler', async () => {
    const { api } = fixture();
    const callbacks: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    try {
      const writer = createGpuExportWriter(api as unknown as ExperimentalGpuExportApi);
      await writer.prepareVideo!(0);
      const task = writer.addVideo(0, 1);
      expect(api.frame).not.toHaveBeenCalled();
      callbacks.shift()!(0);
      expect(api.frame).not.toHaveBeenCalled();
      callbacks.shift()!(1);
      await task;
      expect(api.frame).toHaveBeenCalledWith(0);
    } finally {
      raf.mockRestore();
    }
  });
  it('transfers PCM audio with exact sample positions and always closes the sample', async () => {
    const { writer, api } = fixture();
    const value = sample();
    const close = vi.spyOn(value, 'close');
    await writer.addAudio(value);
    expect(api.audio).toHaveBeenCalledWith(expect.any(Uint8Array), 24000);
    expect(close).toHaveBeenCalledOnce();
    const failed = sample();
    const failedClose = vi.spyOn(failed, 'close');
    api.audio.mockRejectedValueOnce(new Error('disk full'));
    await expect(writer.addAudio(failed)).rejects.toThrow('disk full');
    expect(failedClose).toHaveBeenCalledOnce();
  });
  it('rejects incompatible and closed audio without leaking samples', async () => {
    const { writer, api } = fixture();
    for (const value of [sample(1), sample(2, 44100)]) {
      const close = vi.spyOn(value, 'close');
      await expect(writer.addAudio(value)).rejects.toThrow('48 kHz stereo');
      expect(close).toHaveBeenCalledOnce();
    }
    writer.closeAudio();
    const value = sample();
    const close = vi.spyOn(value, 'close');
    await expect(writer.addAudio(value)).rejects.toThrow('closed');
    expect(close).toHaveBeenCalledOnce();
    expect(api.audio).not.toHaveBeenCalled();
  });
});
