import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { Quality } from 'mediabunny';
import type { VideoEncoderRequirements } from '@beam/encoder/mediabunny/video-encoder-selection-types';
import { selectVideoEncoder } from '@beam/encoder/mediabunny/video-encoder-selection';

const supports = vi.hoisted(() => vi.fn<typeof import('mediabunny').canEncodeVideo>());
const probe = vi.hoisted(() =>
  vi.fn<typeof import('@beam/encoder/mediabunny/video-encoder-probe').probeHardwareVideoEncoder>(),
);
vi.mock('@beam/encoder/mediabunny/video-encoder-probe', () => ({ probeHardwareVideoEncoder: probe }));
vi.mock('mediabunny', async (importOriginal) => ({
  ...(await importOriginal<typeof import('mediabunny')>()),
  canEncodeVideo: supports,
}));

const requirements: VideoEncoderRequirements = {
  format: 'webm',
  width: 1920,
  height: 1080,
  frameRate: 30,
  bitrate: 5_910_000,
};
const mode = (options: Parameters<typeof supports>[1]) =>
  (['variable', 'constant'] as const).find((bitrateMode) =>
    isDeepStrictEqual(options?.quality, new Quality({ bitrate: requirements.bitrate, bitrateMode })),
  );

describe('WebCodecs encoder selection', () => {
  beforeEach(() => {
    supports.mockReset().mockResolvedValue(false);
    probe.mockReset().mockResolvedValue(null);
  });

  it.each(['mp4', 'webm'] as const)(
    'prefers variable bitrate hardware for %s with the exact export settings',
    async (format) => {
      supports.mockResolvedValue(true);
      const result = await selectVideoEncoder({ ...requirements, format });
      expect(result).toMatchObject({
        codec: format === 'mp4' ? 'avc' : 'vp9',
        hardwareAcceleration: 'prefer-hardware',
        bitrateMode: 'variable',
      });
      expect(supports).toHaveBeenCalledOnce();
      expect(supports).toHaveBeenCalledWith(result.codec, {
        width: 1920,
        height: 1080,
        frameRate: 30,
        quality: result.quality,
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'quality',
      });
      expect(result.quality).toEqual(new Quality({ bitrate: 5_910_000, bitrateMode: 'variable' }));
      expect(probe).toHaveBeenCalledWith(
        { ...requirements, format },
        expect.objectContaining({ codec: result.codec, quality: result.quality }),
      );
      expect(result.hardwareEncoderCheck).toBe('passed');
    },
  );

  it.each(['mp4', 'webm'] as const)(
    'accepts constant bitrate hardware when variable is unsupported for %s',
    async (format) => {
      supports.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const result = await selectVideoEncoder({ ...requirements, format });
      expect(result).toMatchObject({ hardwareAcceleration: 'prefer-hardware', bitrateMode: 'constant' });
      expect(supports.mock.calls.map(([, options]) => mode(options))).toEqual(['variable', 'constant']);
    },
  );

  it.each(['vp8', 'av1'] as const)('chooses hardware %s before software VP9', async (codec) => {
    supports.mockImplementation(
      async (candidate, options) => candidate === codec && options?.hardwareAcceleration === 'prefer-hardware',
    );
    expect(await selectVideoEncoder(requirements)).toMatchObject({ codec, hardwareAcceleration: 'prefer-hardware' });
    expect(supports.mock.calls.every(([, options]) => options?.hardwareAcceleration === 'prefer-hardware')).toBe(true);
  });

  it.each(['variable', 'constant'] as const)(
    'uses an available WebCodecs %s configuration when hardware is unsupported',
    async (bitrateMode) => {
      supports.mockImplementation(
        async (_, options) => options?.hardwareAcceleration === 'prefer-software' && mode(options) === bitrateMode,
      );
      expect(await selectVideoEncoder(requirements)).toMatchObject({
        codec: 'vp9',
        hardwareAcceleration: 'prefer-software',
        bitrateMode,
        hardwareEncoderCheck: 'unsupported',
        hardwareEncoderError: null,
      });
      expect(supports.mock.calls.slice(0, 6).map(([codec]) => codec)).toEqual([
        'vp9',
        'vp9',
        'vp8',
        'vp8',
        'av1',
        'av1',
      ]);
    },
  );

  it('continues through software codec candidates without changing the container', async () => {
    supports.mockImplementation(
      async (codec, options) => codec === 'av1' && options?.hardwareAcceleration === 'prefer-software',
    );
    expect(await selectVideoEncoder(requirements)).toMatchObject({
      codec: 'av1',
      hardwareAcceleration: 'prefer-software',
    });
  });

  it('rejects advertised hardware that cannot produce a frame and records why it uses software WebCodecs', async () => {
    supports.mockResolvedValue(true);
    probe.mockResolvedValue('Encoding error.');
    const result = await selectVideoEncoder(requirements);
    expect(result).toMatchObject({
      codec: 'vp9',
      hardwareAcceleration: 'prefer-software',
      hardwareEncoderCheck: 'failed',
      hardwareEncoderError: 'av1 (constant): Encoding error.',
    });
    expect(probe).toHaveBeenCalledTimes(6);
    expect(supports.mock.calls.at(-1)?.[1]?.hardwareAcceleration).toBe('prefer-software');
  });

  it('uses a working hardware configuration after a rejected hardware frame probe', async () => {
    supports.mockResolvedValue(true);
    probe.mockResolvedValueOnce('buffer allocation failed').mockResolvedValue(null);
    expect(await selectVideoEncoder(requirements)).toMatchObject({
      codec: 'vp9',
      bitrateMode: 'constant',
      hardwareEncoderCheck: 'passed',
      hardwareEncoderError: null,
    });
  });

  it.each(['mp4', 'webm'] as const)('reports unsupported %s after checking both bitrate modes', async (format) => {
    await expect(selectVideoEncoder({ ...requirements, format })).rejects.toThrow(
      `${format.toUpperCase()} video is not encodable`,
    );
    expect(supports).toHaveBeenCalledTimes(format === 'mp4' ? 4 : 12);
  });

  it('propagates capability errors instead of treating them as a supported configuration', async () => {
    supports.mockRejectedValue(new Error('invalid dimensions'));
    await expect(selectVideoEncoder(requirements)).rejects.toThrow('invalid dimensions');
    expect(supports).toHaveBeenCalledOnce();
  });
});
