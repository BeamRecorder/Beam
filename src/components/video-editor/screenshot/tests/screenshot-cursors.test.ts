import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { Canvas2DContext } from '~/types/canvas';
import type { ScreenshotCursorLayer } from '../screenshot-layer-types';

const runtime = vi.hoisted(() => ({ loadCursorImage: vi.fn() }));
vi.mock('../../properties/cursor/cursor-image-loader', () => ({ loadCursorImage: runtime.loadCursorImage }));

import {
  createScreenshotCursor,
  drawScreenshotCursor,
  loadScreenshotCursors,
  screenshotCursorTransform,
  transformScreenshotCursor,
} from '../screenshot-cursors';

const pointer: CursorAssetDescriptor = {
  id: 'pointer',
  label: 'Pointer',
  url: 'project-media://cursor/pack/pointer.svg',
  format: 'svg',
  tintable: true,
  intrinsicSize: { width: 64, height: 32 },
  nominalSize: 32,
  hotspot: { x: 8, y: 4 },
};

const pack = (id = 'pack:sample', cursor = pointer): CursorPackDescriptor => ({
  id,
  name: id,
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: cursor.id,
  cursors: [cursor],
  automaticMap: { default: cursor.id },
});

const layer = (overrides: Partial<ScreenshotCursorLayer> = {}): ScreenshotCursorLayer => {
  const base = createScreenshotCursor('cursor-1', 'Pointer', pack());
  return {
    ...base,
    ...overrides,
    position: { ...base.position, ...overrides.position },
    selection: { ...base.selection, ...overrides.selection },
  };
};

const image = {} as CanvasImageSource;

describe('screenshot cursor layers', () => {
  beforeEach(() => {
    runtime.loadCursorImage.mockReset().mockResolvedValue(image);
  });

  it('starts as a fixed instance of the selected pack default with the video cursor appearance defaults', () => {
    expect(createScreenshotCursor('cursor-1', 'Pointer', pack())).toMatchObject({
      id: 'cursor-1',
      name: 'Pointer',
      enabled: true,
      position: { x: 0.45, y: 0.45 },
      size: 45,
      rotation: 0,
      selection: { packId: 'pack:sample', mode: 'fixed', cursorId: 'pointer' },
      color: '#000000',
      shadowEnabled: true,
      shadowBlur: 6,
      shadowColor: '#000000',
      shadowDirection: 'bottom',
    });
  });

  it('keeps maximum-size normalized bounds consistent between export and scaled preview', () => {
    const cursor = layer({ position: { x: 0.2, y: 0.35 }, size: 384 });
    const exportBounds = screenshotCursorTransform(cursor, { width: 1920, height: 1080 }, pointer);
    const previewBounds = screenshotCursorTransform(cursor, { width: 960, height: 540 }, pointer);

    expect(exportBounds).toEqual({ x: 0.2, y: 0.35, width: 768 / 1920, height: 384 / 1080 });
    expect(previewBounds).toEqual({ x: 0.2, y: 0.35, width: exportBounds.width, height: exportBounds.height });
  });

  it('updates the normalized top-left when resized and clamps to the shared cursor-size limit', () => {
    const cursor = layer();
    const initial = screenshotCursorTransform(cursor, { width: 1920, height: 1080 }, pointer);
    transformScreenshotCursor(cursor, initial, {
      x: 0.3,
      y: 0.25,
      width: initial.width * 2,
      height: initial.height * 2,
    });

    expect(cursor.position).toEqual({ x: 0.3, y: 0.25 });
    expect(cursor.size).toBe(90);

    cursor.size = 200;
    const large = screenshotCursorTransform(cursor, { width: 1920, height: 1080 }, pointer);
    transformScreenshotCursor(cursor, large, {
      ...large,
      width: large.width * 2,
      height: large.height * 2,
    });
    expect(cursor.size).toBe(384);
  });

  it('loads the exact fixed assets at the maximum editable size and skips disabled layers', async () => {
    const otherAsset: CursorAssetDescriptor = {
      ...pointer,
      id: 'cross',
      label: 'Cross',
      intrinsicSize: { width: 32, height: 32 },
    };
    const otherPack = pack('pack:other', otherAsset);
    const active = layer();
    const other = layer({
      id: 'cursor-2',
      name: 'Cross',
      selection: { packId: otherPack.id, mode: 'fixed', cursorId: otherAsset.id },
      size: 20,
      color: '#ff0000',
    });
    const disabled = layer({ id: 'cursor-disabled', enabled: false });

    const assets = await loadScreenshotCursors([active, other, disabled], [pack(), otherPack], {
      width: 1920,
      height: 1080,
    });

    expect(runtime.loadCursorImage).toHaveBeenCalledTimes(2);
    expect(runtime.loadCursorImage).toHaveBeenNthCalledWith(1, pack(), pointer, 768, 384, '#000000');
    expect(runtime.loadCursorImage).toHaveBeenNthCalledWith(2, otherPack, otherAsset, 384, 384, '#ff0000');
    expect(assets.get(active.id)).toEqual({ image, asset: pointer });
    expect(assets.get(other.id)).toEqual({ image, asset: otherAsset });
    expect(assets.has(disabled.id)).toBe(false);
  });

  it('rejects a removed pack or cursor instead of silently switching to a default asset', async () => {
    await expect(
      loadScreenshotCursors(
        [layer({ selection: { packId: 'pack:removed', mode: 'fixed', cursorId: 'pointer' } })],
        [pack()],
        { width: 1920, height: 1080 },
      ),
    ).rejects.toThrow('Cursor asset unavailable: pack:removed/pointer');

    await expect(
      loadScreenshotCursors(
        [layer({ selection: { packId: 'pack:sample', mode: 'fixed', cursorId: 'removed' } })],
        [pack()],
        { width: 1920, height: 1080 },
      ),
    ).rejects.toThrow('Cursor asset unavailable: pack:sample/removed');
    expect(runtime.loadCursorImage).not.toHaveBeenCalled();
  });

  it('surfaces cursor image decoding failures to the screenshot renderer', async () => {
    runtime.loadCursorImage.mockRejectedValueOnce(new Error('cursor image decode failed'));

    await expect(loadScreenshotCursors([layer()], [pack()], { width: 1920, height: 1080 })).rejects.toThrow(
      'cursor image decode failed',
    );
  });

  it('draws the image within its layer bounds with centered rotation and scaled directional shadow', () => {
    const drawImage = vi.fn();
    const translate = vi.fn();
    const rotate = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate,
      rotate,
      drawImage,
      shadowBlur: 0,
      shadowColor: '',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as Canvas2DContext;
    const cursor = layer({
      position: { x: 0.2, y: 0.3 },
      size: 384,
      rotation: 30,
      shadowBlur: 8,
      shadowColor: '#123456',
      shadowDirection: 'bottom-right',
    });

    drawScreenshotCursor(ctx, cursor, { image, asset: pointer }, 1920, 1080);

    expect(translate).toHaveBeenCalledWith(768, 516);
    expect(rotate).toHaveBeenCalledWith(Math.PI / 6);
    expect(ctx.shadowBlur).toBe(8);
    expect(ctx.shadowColor).toBe('#123456');
    expect(ctx.shadowOffsetX).toBe(3);
    expect(ctx.shadowOffsetY).toBe(3);
    expect(drawImage).toHaveBeenCalledWith(image, -384, -192, 768, 384);
  });
});
