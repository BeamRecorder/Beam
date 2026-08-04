import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({
  ALL_FORMATS: ['all'],
  BlobSource: vi.fn(),
  CanvasSink: vi.fn(),
  Input: vi.fn(),
}));
vi.mock('mediabunny', () => media);

import { useProjectThumbnailGenerator } from './useProjectThumbnailGenerator';

describe('useProjectThumbnailGenerator', () => {
  const fetchMock = vi.fn();
  let input: { getPrimaryVideoTrack: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
  let track: { getDurationFromMetadata: ReturnType<typeof vi.fn>; computeDuration: ReturnType<typeof vi.fn> };
  let canvasesAtTimestamps: ReturnType<typeof vi.fn>;
  let saveProjectThumbnail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    input = { getPrimaryVideoTrack: vi.fn(), dispose: vi.fn() };
    track = { getDurationFromMetadata: vi.fn(), computeDuration: vi.fn() };
    canvasesAtTimestamps = vi.fn();
    saveProjectThumbnail = vi.fn();
    media.BlobSource.mockImplementation(function BlobSourceMock(blob) {
      return { blob };
    });
    media.Input.mockImplementation(function InputMock() {
      return input;
    });
    media.CanvasSink.mockImplementation(function CanvasSinkMock() {
      return { canvasesAtTimestamps };
    });
    Object.defineProperty(window, 'capture', { configurable: true, value: { saveProjectThumbnail } });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,thumbnail');
  });

  it('generates, saves and caches a thumbnail at the middle of the video', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 320;
    sourceCanvas.height = 180;
    fetchMock.mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(new Blob(['video'])) });
    input.getPrimaryVideoTrack.mockResolvedValue(track);
    track.getDurationFromMetadata.mockResolvedValue(10);
    canvasesAtTimestamps.mockReturnValue(
      (async function* () {
        yield { canvas: sourceCanvas };
      })(),
    );
    saveProjectThumbnail.mockResolvedValue('saved://thumbnail');
    const { generateThumbnail, thumbnailCache } = useProjectThumbnailGenerator();

    await expect(generateThumbnail('success-project', 'video://source')).resolves.toBe(
      'data:image/webp;base64,thumbnail',
    );
    expect(fetchMock).toHaveBeenCalledWith('video://source');
    expect(media.Input).toHaveBeenCalledWith(expect.objectContaining({ formats: media.ALL_FORMATS }));
    expect(canvasesAtTimestamps).toHaveBeenCalledWith([5]);
    expect(saveProjectThumbnail).toHaveBeenCalledWith('success-project', 'data:image/webp;base64,thumbnail');
    expect(thumbnailCache['success-project']).toBe('saved://thumbnail');
    expect(input.dispose).toHaveBeenCalledOnce();

    await expect(generateThumbnail('success-project', 'video://other')).resolves.toBe('saved://thumbnail');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns null for empty sources, failed responses and missing tracks', async () => {
    const { generateThumbnail } = useProjectThumbnailGenerator();
    await expect(generateThumbnail('empty-project', '')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(generateThumbnail('failed-project', 'video://failed')).resolves.toBeNull();
    expect(media.Input).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(new Blob()) });
    input.getPrimaryVideoTrack.mockResolvedValue(null);
    await expect(generateThumbnail('no-track-project', 'video://no-track')).resolves.toBeNull();
    expect(input.dispose).toHaveBeenCalledOnce();
  });

  it('uses a fallback duration and ignores frames without a usable canvas context', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 320;
    sourceCanvas.height = 180;
    fetchMock.mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(new Blob()) });
    input.getPrimaryVideoTrack.mockResolvedValue(track);
    track.getDurationFromMetadata.mockResolvedValue(null);
    track.computeDuration.mockResolvedValue(null);
    canvasesAtTimestamps.mockReturnValue(
      (async function* () {
        yield { canvas: undefined };
        yield { canvas: sourceCanvas };
      })(),
    );
    const context = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
    context.mockReturnValueOnce(null).mockReturnValueOnce({ drawImage: vi.fn() });
    const { generateThumbnail } = useProjectThumbnailGenerator();

    await expect(generateThumbnail('fallback-project', 'video://fallback')).resolves.toBeNull();
    expect(canvasesAtTimestamps).toHaveBeenCalledWith([0.1]);
    expect(input.dispose).toHaveBeenCalledOnce();
  });

  it('swallows media and thumbnail-save errors and always disposes input', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const first = useProjectThumbnailGenerator();
    await expect(first.generateThumbnail('network-project', 'video://network')).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(new Blob()) });
    input.getPrimaryVideoTrack.mockResolvedValue(track);
    track.getDurationFromMetadata.mockResolvedValue(1);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 240;
    sourceCanvas.height = 135;
    canvasesAtTimestamps.mockReturnValue(
      (async function* () {
        yield { canvas: sourceCanvas };
      })(),
    );
    saveProjectThumbnail.mockRejectedValue(new Error('permission'));
    await expect(first.generateThumbnail('save-error-project', 'video://save-error')).resolves.toBe(
      'data:image/webp;base64,thumbnail',
    );
    expect(input.dispose).toHaveBeenCalledOnce();
  });
});
