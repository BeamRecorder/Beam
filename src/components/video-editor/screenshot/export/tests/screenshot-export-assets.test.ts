import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScreenshotCursorAsset } from '../../screenshot-layer-types';
import { bitmap, stateFixture } from './export-test-support';
const loading = vi.hoisted(() => ({ decorations: vi.fn() }));
vi.mock('../../screenshot-render', () => ({ loadScreenshotDecorations: loading.decorations }));
import { screenshotExportAssets } from '../screenshot-export-assets';

let clone: ReturnType<typeof vi.fn>;
beforeEach(() => {
  loading.decorations.mockReset().mockResolvedValue({ logo: null });
  clone = vi.fn(async () => bitmap());
  vi.stubGlobal('createImageBitmap', clone);
});
afterEach(() => vi.unstubAllGlobals());
it('does not decode photos on the UI thread or invent missing decorations', async () => {
  const result = await screenshotExportAssets(stateFixture());
  expect(result).toEqual({ decorations: { logo: null, cursors: undefined }, transfer: [] });
  expect(clone).not.toHaveBeenCalled();
});
it('transfers each unique SVG decoration once while preserving cursor metadata', async () => {
  const source = {} as CanvasImageSource;
  const cursor = { image: source, asset: { id: 'cursor' } } as ScreenshotCursorAsset;
  loading.decorations.mockResolvedValue({
    logo: source,
    cursors: new Map([
      ['one', cursor],
      ['two', cursor],
    ]),
  });
  const result = await screenshotExportAssets(stateFixture());
  expect(clone).toHaveBeenCalledOnce();
  expect(result.transfer).toHaveLength(1);
  expect(result.decorations.logo).toBe(result.decorations.cursors!.get('two')!.image);
  expect(cursor.image).toBe(source);
  expect(result.decorations.cursors!.get('one')!.asset).toEqual({ id: 'cursor' });
});
it('closes every late successful clone if another decoration cannot be cloned', async () => {
  const good = bitmap();
  const source = {} as CanvasImageSource;
  loading.decorations.mockResolvedValue({
    logo: source,
    cursors: new Map([['one', { image: {} as CanvasImageSource, asset: {} }]]),
  });
  clone.mockRejectedValueOnce(new Error('clone failed')).mockResolvedValueOnce(good);
  await expect(screenshotExportAssets(stateFixture())).rejects.toThrow('clone failed');
  expect(good.close).toHaveBeenCalledOnce();
});
it('propagates decoration loading failures without starting transfers', async () => {
  loading.decorations.mockRejectedValue(new Error('cursor missing'));
  await expect(screenshotExportAssets(stateFixture())).rejects.toThrow('cursor missing');
  expect(clone).not.toHaveBeenCalled();
});
