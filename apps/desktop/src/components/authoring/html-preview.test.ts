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
  it('presents completed frames while a faster playback clock keeps advancing', async () => {
    const completions: Array<(pixels: ImageBitmap) => void> = [];
    const services = {
      render: vi.fn(() => new Promise<ImageBitmap>((resolve) => completions.push(resolve))),
      changed: vi.fn(),
      failed: vi.fn(),
    };
    const preview = createHtmlPreview(services);
    const playing = (timeMs: number, playbackEpoch = 1) => ({ ...item(timeMs), playbackEpoch });
    preview.update([playing(0)]);
    preview.update([playing(33)]);
    preview.update([playing(66)]);
    const first = bitmap();
    completions.shift()!(first);
    await settle();
    expect(preview.frameFor('clip')?.bitmap).toBe(first);
    expect(services.render.mock.calls[1]).toEqual([item().html, 66]);
    preview.update([playing(99)]);
    preview.update([playing(133)]);
    const second = bitmap();
    completions.shift()!(second);
    await settle();
    expect(preview.frameFor('clip')?.bitmap).toBe(second);
    expect(first.close).toHaveBeenCalledOnce();
    expect(services.changed).toHaveBeenCalledTimes(2);
    preview.dispose();
    completions.shift()!(bitmap());
    await settle();
  });
  it.each(['pause', 'seek', 'reverse', 'hidden'] as const)(
    'discards an in-flight playback frame after %s',
    async (change) => {
      let complete!: (pixels: ImageBitmap) => void;
      const latest = bitmap();
      const services = {
        render: vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<ImageBitmap>((resolve) => {
                complete = resolve;
              }),
          )
          .mockResolvedValue(latest),
        changed: vi.fn(),
        failed: vi.fn(),
      };
      const preview = createHtmlPreview(services);
      preview.update([{ ...item(1000), playbackEpoch: 1 }]);
      preview.update(
        change === 'hidden'
          ? []
          : [
              {
                ...item(change === 'reverse' ? 500 : 2000),
                ...(change === 'pause' ? {} : { playbackEpoch: change === 'seek' ? 2 : 1 }),
              },
            ],
      );
      const stale = bitmap();
      complete(stale);
      await settle();
      expect(stale.close).toHaveBeenCalledOnce();
      expect(preview.frameFor('clip')?.bitmap ?? null).toBe(change === 'hidden' ? null : latest);
      preview.dispose();
    },
  );
  it('reports a failing source once while the clock advances and retries a new revision', async () => {
    const services = { render: vi.fn().mockRejectedValue(new Error('no texture')), changed: vi.fn(), failed: vi.fn() };
    const preview = createHtmlPreview(services);
    for (let time = 0; time < 200; time += 33) {
      preview.update([{ ...item(time), playbackEpoch: 1 }]);
      await settle();
    }
    expect(services.failed).toHaveBeenCalledOnce();
    expect(services.render).toHaveBeenCalledOnce();
    services.render.mockResolvedValue(bitmap());
    preview.update([item(200, 'fixed')]);
    await settle();
    expect(preview.frameFor('clip')).not.toBeNull();
    preview.dispose();
  });
  it('captures one completed frame and releases it on hide and disposal', async () => {
    const pixels = bitmap(),
      services = {
        render: vi.fn(async () => pixels),
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
    let complete!: (pixels: ImageBitmap) => void;
    const stale = bitmap(),
      latest = bitmap();
    const services = {
      render: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<ImageBitmap>((resolve) => {
              complete = resolve;
            }),
        )
        .mockResolvedValue(latest),
      changed: vi.fn(),
      failed: vi.fn(),
    };
    const preview = createHtmlPreview(services);
    preview.update([item(1000)]);
    preview.update([item(2000)]);
    preview.update([item(500, 'new')]);
    complete(stale);
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
    const services = { render: vi.fn().mockRejectedValue(error), changed: vi.fn(), failed };
    const preview = createHtmlPreview(services);
    preview.update([item()]);
    await settle();
    preview.update([item()]);
    await settle();
    expect(failed).toHaveBeenCalledExactlyOnceWith(error);
    expect(services.render).toHaveBeenCalledTimes(1);
    let finish!: (pixels: ImageBitmap) => void;
    const pixels = bitmap();
    services.render.mockImplementation(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          finish = resolve;
        }),
    );
    preview.update([item(30, 'retry')]);
    preview.dispose();
    finish(pixels);
    await settle();
    expect(pixels.close).toHaveBeenCalledTimes(1);
  });
});
