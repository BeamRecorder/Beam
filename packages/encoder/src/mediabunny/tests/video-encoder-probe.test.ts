import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Quality } from 'mediabunny';
import { probeHardwareVideoEncoder } from '@beam/encoder/mediabunny/video-encoder-probe';
import type { VideoEncoderRequirements } from '@beam/encoder/mediabunny/video-encoder-selection-types';

const runtime = vi.hoisted(() => ({
  context: { fillRect: vi.fn() },
  getContext: vi.fn(),
  add: vi.fn(),
  close: vi.fn(),
  start: vi.fn(),
  finalize: vi.fn(),
  cancel: vi.fn(),
  state: 'pending' as 'pending' | 'started' | 'canceled' | 'finalized',
  options: null as import('mediabunny').VideoEncodingConfig | null,
  frameRate: 0,
  packets: 1,
}));
vi.mock('mediabunny', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mediabunny')>();
  return {
    ...actual,
    CanvasSource: class {
      constructor(_canvas: OffscreenCanvas, options: import('mediabunny').VideoEncodingConfig) {
        runtime.options = options;
      }
      add = runtime.add;
      close = runtime.close;
    },
    Output: class {
      get state() {
        return runtime.state;
      }
      addVideoTrack(_source: unknown, options: { frameRate: number }) {
        runtime.frameRate = options.frameRate;
      }
      start = runtime.start;
      finalize = runtime.finalize;
      cancel = runtime.cancel;
    },
  };
});
const requirements: VideoEncoderRequirements = {
  format: 'webm',
  width: 1920,
  height: 1080,
  frameRate: 30,
  bitrate: 5_910_000,
};
const selection = {
  codec: 'vp9' as const,
  quality: new Quality({ bitrate: requirements.bitrate, bitrateMode: 'constant' }),
  hardwareAcceleration: 'prefer-hardware' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  runtime.state = 'pending';
  runtime.options = null;
  runtime.packets = 1;
  runtime.frameRate = 0;
  runtime.getContext.mockReturnValue(runtime.context);
  runtime.start.mockImplementation(async () => {
    runtime.state = 'started';
  });
  runtime.add.mockResolvedValue(undefined);
  runtime.finalize.mockImplementation(async () => {
    for (let i = 0; i < runtime.packets; i++)
      runtime.options?.onEncodedPacket?.({} as import('mediabunny').EncodedPacket);
    runtime.state = 'finalized';
  });
  runtime.cancel.mockImplementation(async () => {
    runtime.state = 'canceled';
  });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext = runtime.getContext;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('hardware encoder frame verification', () => {
  it.each(['mp4', 'webm'] as const)(
    'verifies one full-size %s frame with the selected quality settings',
    async (format) => {
      expect(await probeHardwareVideoEncoder({ ...requirements, format }, selection)).toBeNull();
      expect(runtime.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
      expect(runtime.context.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
      expect(runtime.options).toMatchObject({ ...selection, latencyMode: 'quality' });
      expect(runtime.frameRate).toBe(30);
      expect(runtime.add).toHaveBeenCalledWith(0, 1 / 30);
      expect(runtime.close).toHaveBeenCalled();
      expect(runtime.cancel).not.toHaveBeenCalled();
    },
  );
  it('rejects a configured encoder that returned no packet', async () => {
    runtime.packets = 0;
    expect(await probeHardwareVideoEncoder(requirements, selection)).toContain('no video packet');
  });
  it('reports unavailable test pixels without allocating encoder resources', async () => {
    runtime.getContext.mockReturnValue(null);
    expect(await probeHardwareVideoEncoder(requirements, selection)).toContain('test image');
    expect(runtime.start).not.toHaveBeenCalled();
  });
  it.each(['start', 'add', 'finalize'] as const)('closes and cancels resources after %s fails', async (method) => {
    runtime[method].mockRejectedValue(new Error('buffer allocation failed'));
    expect(await probeHardwareVideoEncoder(requirements, selection)).toBe('buffer allocation failed');
    expect(runtime.close).toHaveBeenCalled();
    expect(runtime.cancel).toHaveBeenCalledOnce();
  });
  it('bounds unexpected error values before sending diagnostics across JSON', async () => {
    runtime.add.mockRejectedValue('x'.repeat(700));
    expect(await probeHardwareVideoEncoder(requirements, selection)).toHaveLength(500);
  });
  it('does not cancel an output that already disposed itself after failure', async () => {
    runtime.finalize.mockImplementation(async () => {
      runtime.state = 'canceled';
      throw new Error('encoder failed');
    });
    expect(await probeHardwareVideoEncoder(requirements, selection)).toBe('encoder failed');
    expect(runtime.cancel).not.toHaveBeenCalled();
  });
});
