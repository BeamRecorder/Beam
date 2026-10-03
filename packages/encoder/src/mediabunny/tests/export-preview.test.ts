import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExportPreview } from '../export-preview';

class Surface {
  static instances: Surface[] = [];
  readonly context = { drawImage: vi.fn() };
  readonly getContext = vi.fn(() => this.context);
  readonly convertToBlob = vi.fn(async () => new Blob([new Uint8Array([0, 1, 254, 255])]));
  constructor(
    public width: number,
    public height: number,
  ) {
    Surface.instances.push(this);
  }
}
const source = {} as CanvasImageSource;
let now = 0;
beforeEach(() => {
  Surface.instances = [];
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('OffscreenCanvas', Surface);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('export preview', () => {
  it('scales an owned thumbnail, publishes correct bytes and throttles completed conversions', async () => {
    const preview = createExportPreview(1920, 1080),
      surface = Surface.instances[0]!;
    expect([surface.width, surface.height]).toEqual([256, 144]);
    expect(preview.current).toBeUndefined();
    expect(preview.capture(source)).toBeUndefined();
    await preview.settle();
    expect(preview.current).toBe('data:image/jpeg;base64,AAH+/w==');
    expect(surface.context.drawImage).toHaveBeenCalledExactlyOnceWith(source, 0, 0, 256, 144);
    expect(surface.convertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.65 });
    now = 500;
    preview.capture(source);
    expect(surface.convertToBlob).toHaveBeenCalledOnce();
    now = 501;
    preview.capture(source);
    await preview.settle();
    expect(surface.convertToBlob).toHaveBeenCalledTimes(2);
    preview.dispose();
    expect([surface.width, surface.height]).toEqual([0, 0]);
    expect(preview.current).toBeUndefined();
  });

  it('keeps at most one conversion in flight without making capture await it', async () => {
    const preview = createExportPreview(100, 100),
      surface = Surface.instances[0]!;
    let complete!: (blob: Blob) => void;
    surface.convertToBlob.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    preview.capture(source);
    now = 5000;
    for (let frame = 0; frame < 60; frame++) expect(preview.capture(source)).toBeUndefined();
    expect(surface.convertToBlob).toHaveBeenCalledOnce();
    expect(surface.context.drawImage).toHaveBeenCalledOnce();
    expect(preview.current).toBeUndefined();
    complete(new Blob([new Uint8Array(10000).fill(255)]));
    await preview.settle();
    expect(preview.current).toBe(
      `data:image/jpeg;base64,${btoa(String.fromCharCode(...new Uint8Array(10000).fill(255)))}`,
    );
    preview.capture(source);
    await preview.settle();
    expect(surface.convertToBlob).toHaveBeenCalledTimes(2);
  });

  it('defers surface release and prevents late publication after cancellation or repeated disposal', async () => {
    const preview = createExportPreview(1, 10000),
      surface = Surface.instances[0]!;
    expect([surface.width, surface.height]).toEqual([2, 144]);
    let complete!: (blob: Blob) => void;
    surface.convertToBlob.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    preview.capture(source);
    preview.dispose();
    preview.dispose();
    expect(surface.height).toBe(144);
    now = 1000;
    preview.capture(source);
    complete(new Blob([]));
    await preview.settle();
    expect(preview.current).toBeUndefined();
    expect([surface.width, surface.height]).toEqual([0, 0]);
    expect(surface.context.drawImage).toHaveBeenCalledOnce();
  });

  it.each(['blob', 'bytes'])(
    'reports %s failures at capture and final settling without unhandled rejection',
    async (stage) => {
      const preview = createExportPreview(1920, 1080),
        surface = Surface.instances[0]!;
      const failure = new Error('thumbnail failed');
      if (stage === 'blob') surface.convertToBlob.mockRejectedValueOnce(failure);
      else
        surface.convertToBlob.mockResolvedValueOnce({
          arrayBuffer: async () => {
            throw failure;
          },
        } as Blob);
      preview.capture(source);
      await expect(preview.settle()).rejects.toBe(failure);
      expect(() => preview.capture(source)).toThrow(failure);
      expect(preview.current).toBeUndefined();
      preview.dispose();
      expect(surface.width).toBe(0);
    },
  );

  it('handles empty thumbnails and settling without capture', async () => {
    const preview = createExportPreview(10000, 1),
      surface = Surface.instances[0]!;
    expect([surface.width, surface.height]).toEqual([256, 2]);
    await preview.settle();
    surface.convertToBlob.mockResolvedValueOnce(new Blob([]));
    preview.capture(source);
    await preview.settle();
    expect(preview.current).toBe('data:image/jpeg;base64,');
  });

  it('releases a surface whose 2D context is unavailable', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class extends Surface {
        readonly getContext = vi.fn(() => null) as unknown as Surface['getContext'];
      },
    );
    expect(() => createExportPreview(1920, 1080)).toThrow('Export preview canvas is unavailable.');
    expect(Surface.instances[0]!.width).toBe(0);
  });
});
