import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFrame, MediaSourceDescriptor } from '@beam/runtime/shared/media-types';

const { openMediaInput, sinkGetCanvas, sinkConstructor, CanvasSink, MediaInputError, ownedMediaFrame } = vi.hoisted(
  () => {
    class TestMediaInputError extends Error {
      detail: unknown;

      constructor(detail: { message: string }) {
        super(detail.message);
        this.name = 'MediaInputError';
        this.detail = detail;
      }
    }

    const owned = (
      clipId: string,
      bitmap: ImageBitmap,
      timestampSeconds: number,
      durationSeconds: number,
    ): MediaFrame => {
      let closed = false;
      return {
        clipId,
        bitmap,
        timestampSeconds,
        durationSeconds,
        width: bitmap.width,
        height: bitmap.height,
        byteSize: bitmap.width * bitmap.height * 4,
        close: () => {
          if (closed) return;
          closed = true;
          bitmap.close();
        },
      };
    };

    class TestCanvasSink {
      constructor(track: unknown, options: unknown) {
        sinkConstructor(track, options);
      }

      getCanvas(timestamp: number) {
        return sinkGetCanvas(timestamp);
      }
    }

    return {
      openMediaInput: vi.fn(),
      sinkGetCanvas: vi.fn(),
      sinkConstructor: vi.fn(),
      CanvasSink: TestCanvasSink,
      MediaInputError: TestMediaInputError,
      ownedMediaFrame: owned,
    };
  },
);

vi.mock('@beam/runtime/shared/index', () => ({ openMediaInput, MediaInputError, ownedMediaFrame }));
vi.mock('mediabunny', () => ({ CanvasSink }));

import { decodeVideoPoster } from '@beam/runtime/playback/video-poster';

const descriptor: MediaSourceDescriptor = {
  assetId: 'video-1',
  kind: 'video',
  label: 'Video',
  url: 'project-media://asset/video-1',
};

const bitmap = (width = 320, height = 180) => ({
  width,
  height,
  close: vi.fn(),
});

const openedInput = (track: unknown, duration = 10) => ({
  input: {
    getPrimaryVideoTrack: vi.fn().mockResolvedValue(track),
    computeDuration: vi.fn().mockResolvedValue(duration),
  },
  dispose: vi.fn(),
});
const decodableTrack = (codec = 'avc') => ({
  canDecode: vi.fn().mockResolvedValue(true),
  getCodec: vi.fn().mockResolvedValue(codec),
});

beforeEach(() => {
  openMediaInput.mockReset();
  sinkGetCanvas.mockReset();
  sinkConstructor.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('decodeVideoPoster', () => {
  it('decodes the middle poster position with requested dimensions and fit', async () => {
    const track = decodableTrack();
    const opened = openedInput(track, 10);
    const outputBitmap = bitmap(320, 180);
    openMediaInput.mockResolvedValue(opened);
    sinkGetCanvas.mockResolvedValue({
      timestamp: 4.9,
      duration: 0.1,
      canvas: { transferToImageBitmap: vi.fn().mockReturnValue(outputBitmap) },
    });

    const frame = await decodeVideoPoster(descriptor, {
      position: 0.5,
      width: 320,
      height: 180,
      fit: 'cover',
    });

    expect(openMediaInput).toHaveBeenCalledWith(descriptor);
    expect(sinkConstructor).toHaveBeenCalledWith(track, {
      width: 320,
      height: 180,
      fit: 'cover',
      poolSize: 1,
    });
    expect(sinkGetCanvas).toHaveBeenCalledWith(5);
    expect(frame).toMatchObject({
      clipId: 'video-1',
      timestampSeconds: 4.9,
      durationSeconds: 0.1,
      width: 320,
      height: 180,
      byteSize: 320 * 180 * 4,
    });
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('uses an explicit timestamp and transfers ownership of the decoded bitmap', async () => {
    const opened = openedInput(decodableTrack());
    const outputBitmap = bitmap(640, 360);
    const transferToImageBitmap = vi.fn().mockReturnValue(outputBitmap);
    openMediaInput.mockResolvedValue(opened);
    sinkGetCanvas.mockResolvedValue({ timestamp: 2.25, duration: 0.04, canvas: { transferToImageBitmap } });

    const frame = await decodeVideoPoster(descriptor, { timestampSeconds: 2.25, fit: 'contain' });

    expect(sinkGetCanvas).toHaveBeenCalledWith(2.25);
    expect(transferToImageBitmap).toHaveBeenCalledOnce();
    frame.close();
    frame.close();
    expect(outputBitmap.close).toHaveBeenCalledOnce();
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('rejects non-video sources and invalid position or timestamp before opening input', async () => {
    await expect(decodeVideoPoster({ ...descriptor, kind: 'audio' })).rejects.toMatchObject({
      name: 'MediaInputError',
      detail: { kind: 'missing-track', track: 'video', sourceId: 'video-1' },
    });
    await expect(decodeVideoPoster(descriptor, { position: -0.1 })).rejects.toThrow(RangeError);
    await expect(decodeVideoPoster(descriptor, { position: 1.1 })).rejects.toThrow(RangeError);
    await expect(decodeVideoPoster(descriptor, { timestampSeconds: Number.NaN })).rejects.toThrow(RangeError);
    expect(openMediaInput).not.toHaveBeenCalled();
  });

  it('reports a missing video track and disposes the input', async () => {
    const opened = openedInput(null);
    openMediaInput.mockResolvedValue(opened);

    await expect(decodeVideoPoster(descriptor)).rejects.toMatchObject({
      name: 'MediaInputError',
      detail: { kind: 'missing-track', track: 'video', sourceId: 'video-1' },
    });
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('reports unsupported codecs and disposes the input', async () => {
    const track = {
      canDecode: vi.fn().mockResolvedValue(false),
      getCodec: vi.fn().mockResolvedValue('av1-unsupported'),
    };
    const opened = openedInput(track);
    openMediaInput.mockResolvedValue(opened);

    await expect(decodeVideoPoster(descriptor)).rejects.toMatchObject({
      detail: { kind: 'unsupported-codec', track: 'video', codec: 'av1-unsupported' },
    });
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('reports an absent decoded frame and disposes the input', async () => {
    const opened = openedInput(decodableTrack());
    openMediaInput.mockResolvedValue(opened);
    sinkGetCanvas.mockResolvedValue(null);

    await expect(decodeVideoPoster(descriptor, { timestampSeconds: 4 })).rejects.toMatchObject({
      detail: { kind: 'decode-failure', sourceId: 'video-1' },
    });
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the input when canvas decoding fails', async () => {
    const opened = openedInput(decodableTrack());
    openMediaInput.mockResolvedValue(opened);
    sinkGetCanvas.mockRejectedValue(new Error('decoder failed'));

    await expect(decodeVideoPoster(descriptor)).rejects.toThrow('decoder failed');
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it.each(['vp9', 'av1'])('uses the buffered software decoder for Linux %s posters', async (codec) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64)');
    const track = decodableTrack(codec);
    openMediaInput.mockResolvedValue(openedInput(track));
    sinkGetCanvas.mockResolvedValue({
      timestamp: 5,
      duration: 0.04,
      canvas: { transferToImageBitmap: () => bitmap() },
    });

    await decodeVideoPoster(descriptor);

    expect(sinkConstructor).toHaveBeenCalledWith(
      track,
      expect.objectContaining({
        decoderOptions: { hardwareAcceleration: 'prefer-software', optimizeForLatency: false },
      }),
    );
  });

  it('keeps the platform decoder defaults outside Linux and converts HTML canvases', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh)');
    const track = decodableTrack('vp9');
    const canvas = document.createElement('canvas');
    const convert = vi.fn().mockResolvedValue(bitmap());
    vi.stubGlobal('createImageBitmap', convert);
    const opened = openedInput(track, 0);
    openMediaInput.mockResolvedValue(opened);
    sinkGetCanvas.mockResolvedValue({ timestamp: 0, duration: 0.04, canvas });
    try {
      await decodeVideoPoster(descriptor, { timestampSeconds: 30 });
      expect(sinkConstructor).toHaveBeenCalledWith(track, {
        width: undefined,
        height: undefined,
        fit: undefined,
        poolSize: 1,
      });
      expect(sinkGetCanvas).toHaveBeenCalledWith(0);
      expect(convert).toHaveBeenCalledWith(canvas);
      expect(opened.dispose).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('disposes the input when inspecting the decoder codec fails', async () => {
    const track = decodableTrack();
    track.getCodec.mockRejectedValue(new Error('codec unavailable'));
    const opened = openedInput(track);
    openMediaInput.mockResolvedValue(opened);
    await expect(decodeVideoPoster(descriptor)).rejects.toThrow('codec unavailable');
    expect(opened.dispose).toHaveBeenCalledOnce();
  });
});
