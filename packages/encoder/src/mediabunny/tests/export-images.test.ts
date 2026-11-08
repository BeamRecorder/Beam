import { beforeEach, expect, it, vi } from 'vitest';
import { loadExportImages } from '../export-images';
import { snapshot } from '@beam/runtime/rendering/tests/render.test-support';
import { DEFAULT_WATERMARK } from '@beam/engine/layout/output-canvas';
import { WATERMARK_LOGO_KEY } from '@beam/runtime/rendering/watermark-render';
import type { ExportRequest } from '../../export-types';

const loadBitmap = vi.hoisted(() => vi.fn());
vi.mock('../export-worker-assets', () => ({ loadBitmap }));
const bitmap = { width: 32, height: 16, close: vi.fn() } as unknown as ImageBitmap;
const request = (): ExportRequest => ({ projectName: 'Images', format: 'mp4', preset: 'high', snapshot: snapshot() });
beforeEach(() => {
  loadBitmap.mockReset().mockResolvedValue(bitmap);
});

it.each([false, true])('loads a selected wallpaper only when showBackground=%s', async (showBackground) => {
  const value = request(),
    owned = new Map<string, ImageBitmap>();
  value.snapshot.canvas.showBackground = showBackground;
  value.snapshot.background = { kind: 'image', src: 'missing-wallpaper.png' };
  if (!showBackground) loadBitmap.mockRejectedValue(new Error('missing wallpaper'));
  const images = await loadExportImages(value, owned);
  expect(loadBitmap).toHaveBeenCalledTimes(showBackground ? 1 : 0);
  expect(images.has('export-background')).toBe(showBackground);
  if (showBackground) {
    expect(images.get('export-background')).toMatchObject({ source: bitmap, width: 32, height: 16 });
    await loadExportImages(value, owned);
    expect(loadBitmap).toHaveBeenCalledOnce();
  }
});

it('keeps image clips independent of the background toggle and reuses duplicate sources', async () => {
  const value = request(),
    owned = new Map<string, ImageBitmap>();
  const original = value.snapshot.composition.clips[0]!;
  if (original.kind !== 'screen') throw new Error('Missing screen fixture');
  const first = { ...value.snapshot.composition.assets[0]!, kind: 'image' as const, src: 'image.png' };
  const second = { ...first, id: 'second' };
  const unused = { ...first, id: 'unused', src: 'unused.png' };
  value.snapshot.composition.assets = [first, second, unused];
  value.snapshot.composition.clips = [
    { ...original, kind: 'image', assetId: first.id },
    { ...original, kind: 'image', id: 'second-clip', assetId: second.id },
    { ...original, kind: 'image', id: 'disabled', assetId: unused.id, enabled: false },
    { ...original, kind: 'image', id: 'empty', assetId: unused.id, timelineDurationMs: 0 },
  ];
  value.snapshot.canvas.showBackground = false;
  const images = await loadExportImages(value, owned);
  expect(loadBitmap).toHaveBeenCalledExactlyOnceWith('image.png', 'image asset "Screen"');
  expect([...images.keys()]).toEqual([first.id, second.id]);
  await loadExportImages(value, owned);
  expect(loadBitmap).toHaveBeenCalledOnce();
  value.frameSources = [{ assetId: first.id, url: 'http://localhost/frames' }];
  expect([...(await loadExportImages(value, owned)).keys()]).toEqual([second.id]);
});

it.each([false, true])('loads a logo independently of the background when showLogo=%s', async (showLogo) => {
  const value = request(),
    owned = new Map<string, ImageBitmap>();
  value.snapshot.canvas.watermark = { ...DEFAULT_WATERMARK, enabled: true, showLogo };
  value.snapshot.canvas.showBackground = false;
  const images = await loadExportImages(value, owned);
  expect(images.has(WATERMARK_LOGO_KEY)).toBe(showLogo);
  expect(loadBitmap).toHaveBeenCalledTimes(showLogo ? 1 : 0);
  await loadExportImages(value, owned);
  expect(loadBitmap).toHaveBeenCalledTimes(showLogo ? 1 : 0);
});
