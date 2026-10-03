import { describe, it, expect, vi } from 'vitest';
import { createHtmlPreview } from './html-preview';
import type { HtmlPreviewFrame } from './html-preview-types';

const item = (timeMs = 0, revision = 'revision'): HtmlPreviewFrame => ({
  clipId: 'clip',
  timeMs,
  html: {
    version: 1,
    id: 'html',
    revision,
    entry: 'index.html',
    width: 64,
    height: 64,
    durationMs: 15000,
    fps: 30,
    framework: 'html',
  },
});
const bitmap = () => ({ width: 64, height: 64, close: vi.fn() }) as unknown as ImageBitmap;
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
describe('HTML preview resource ownership', () => {
  it('captures one completed frame and releases it on hide and disposal', async () => {
    const pixels = bitmap(),
      services = {
        render: vi.fn(async () => new Uint8Array()),
        decode: vi.fn(async () => pixels),
        changed: vi.fn(),
        failed: vi.fn(),
      };
    const preview = createHtmlPreview(services);
    preview.update([item()]);
    await settle();
    expect(preview.frameFor('clip')?.bitmap).toBe(pixels);
    preview.update([item()]);
    await settle();
    expect(services.render).toHaveBeenCalledTimes(1);
    preview.update([]);
    expect(pixels.close).toHaveBeenCalledTimes(1);
    expect(preview.frameFor('clip')).toBeNull();
    preview.dispose();
    preview.update([item()]);
    expect(services.render).toHaveBeenCalledTimes(1);
  });
  it('coalesces reverse seeks and discards stale source revisions', async () => {
    let complete!: (bytes: Uint8Array) => void;
    const stale = bitmap(),
      latest = bitmap();
    const services = {
      render: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Uint8Array>((resolve) => {
              complete = resolve;
            }),
        )
        .mockResolvedValue(new Uint8Array()),
      decode: vi.fn().mockResolvedValueOnce(stale).mockResolvedValue(latest),
      changed: vi.fn(),
      failed: vi.fn(),
    };
    const preview = createHtmlPreview(services);
    preview.update([item(1000)]);
    preview.update([item(2000)]);
    preview.update([item(500, 'new')]);
    complete(new Uint8Array());
    await settle();
    expect(stale.close).toHaveBeenCalledTimes(1);
    expect(services.render).toHaveBeenCalledTimes(2);
    expect(services.render.mock.calls[1]?.[1]).toBe(500);
    expect(preview.frameFor('clip')?.bitmap).toBe(latest);
    preview.update([item(500, 'another')]);
    expect(latest.close).toHaveBeenCalledTimes(1);
    preview.dispose();
  });
  it('reports errors once per requested frame and closes a decoded frame arriving after disposal', async () => {
    const error = new Error('shader failed'),
      failed = vi.fn();
    const services = { render: vi.fn().mockRejectedValue(error), decode: vi.fn(), changed: vi.fn(), failed };
    const preview = createHtmlPreview(services);
    preview.update([item()]);
    await settle();
    preview.update([item()]);
    await settle();
    expect(failed).toHaveBeenCalledExactlyOnceWith(error);
    expect(services.render).toHaveBeenCalledTimes(1);
    let finish!: (bytes: Uint8Array) => void;
    const pixels = bitmap();
    services.render.mockImplementation(
      () =>
        new Promise<Uint8Array>((resolve) => {
          finish = resolve;
        }),
    );
    services.decode.mockResolvedValue(pixels);
    preview.update([item(30)]);
    preview.dispose();
    finish(new Uint8Array());
    await settle();
    expect(pixels.close).toHaveBeenCalledTimes(1);
  });
});
