import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCursorReplacer } from '../useCursorReplacer';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';

class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    this.onload?.();
  }
}

class FailingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    this.onerror?.();
  }
}

class SvgBlob {
  readonly value: string;

  constructor(parts: unknown[]) {
    this.value = parts.map(String).join('');
  }
}

const makeAsset = (packId: string, id = 'default'): CursorAssetDescriptor => ({
  id,
  label: `${packId} ${id}`,
  url: `project-media://cursor/${packId}/${id}`,
  intrinsicSize: { width: 32, height: 16 },
  nominalSize: 32,
  hotspot: { x: 4, y: 3 },
});

const makePack = (
  id: string,
  name = id,
  colorMode: CursorPackDescriptor['colorMode'] = 'tintable',
): CursorPackDescriptor => ({
  id,
  name,
  source: 'imported',
  colorMode,
  defaultCursorId: 'default',
  cursors: [makeAsset(id)],
  automaticMap: { default: 'default' },
});

describe('useCursorReplacer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts with the macOS automatic selection and sorts imported packs after it', () => {
    const cursor = useCursorReplacer();

    expect(cursor.selection.value).toEqual({
      packId: 'builtin:macos',
      mode: 'automatic',
      cursorId: null,
    });
    expect(cursor.cursorSize.value).toBe(45);
    expect(cursor.cursorColor.value).toBe('#000000');
    expect(cursor.enableShadow.value).toBe(true);
    expect(cursor.shadowBlur.value).toBe(6);
    expect(cursor.shadowColor.value).toBe('#000000');
    expect(cursor.shadowDirection.value).toBe('bottom');
    expect(cursor.selectedPack.value?.colorMode).toBe('tintable');

    cursor.importedPacks.value = [makePack('pack:zeta', 'Zeta'), makePack('pack:alpha', 'Alpha')];

    expect(cursor.packs.value.map((pack) => pack.id)).toEqual([
      'builtin:macos',
      'builtin:bibata-material-noir',
      'builtin:bibata-material-white',
      'builtin:noir',
      'builtin:noir-white',
      'builtin:moga-dark',
      'builtin:moga-white',
      'pack:alpha',
      'pack:zeta',
    ]);
    expect(cursor.selectedPack.value?.id).toBe('builtin:macos');
  });

  it('makes the fixed black layer of the built-in macOS SVG tintable while preserving its white outline', async () => {
    const pack = useCursorReplacer().packs.value[0]!;
    const asset = pack.cursors[0]!;
    const createObjectURL = vi.fn().mockReturnValue('blob:macos');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('<svg viewBox="0 0 32 32"><path fill="#fff"/><path fill="#000"/></svg>'),
      }),
    );
    vi.stubGlobal('Image', LoadingImage);
    vi.stubGlobal('Blob', SvgBlob);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });

    await useCursorReplacer().getCursorImage(pack, asset, 32, 32, '#ff00ff');
    const svg = (createObjectURL.mock.calls[0]?.[0] as SvgBlob).value;

    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('color="#ff00ff"');
  });

  it('loads a resized tintable SVG and caches it by pack, asset, dimensions and colour', async () => {
    const pack = makePack('pack:tintable');
    const asset = pack.cursors[0]!;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi
        .fn()
        .mockResolvedValue('<svg width="32" height="16" viewBox="0 0 32 16"><path fill="currentColor"/></svg>'),
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:tintable');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Image', LoadingImage);
    vi.stubGlobal('Blob', SvgBlob);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const cursor = useCursorReplacer();
    const image = await cursor.getCursorImage(pack, asset, 80, 40, '#ff00ff');
    const secondImage = await cursor.getCursorImage(pack, asset, 80, 40, '#ff00ff');
    const svgBlob = createObjectURL.mock.calls[0]?.[0] as SvgBlob;
    const svg = svgBlob.value;

    expect(image).toBeInstanceOf(LoadingImage);
    expect(secondImage).toBe(image);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(svg).toContain('width="80" height="40"');
    expect(svg).toContain('color="#ff00ff"');
    expect(svg).toContain('currentColor');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tintable');
  });

  it('loads PNG assets as the fetched Blob without SVG transformation and caches the image', async () => {
    const pack = makePack('pack:png');
    const asset = { ...pack.cursors[0]!, format: 'png' as const };
    const pngBlob = { type: 'image/png', marker: 'png' };
    const blobResponse = vi.fn().mockResolvedValue(pngBlob);
    const textResponse = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: blobResponse, text: textResponse });
    const blobConstructor = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue('blob:png');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Image', LoadingImage);
    vi.stubGlobal('Blob', blobConstructor);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const cursor = useCursorReplacer();
    const image = await cursor.getCursorImage(pack, asset, 80, 40, '#ff00ff');
    const secondImage = await cursor.getCursorImage(pack, asset, 80, 40, '#ff00ff');

    expect(secondImage).toBe(image);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(blobResponse).toHaveBeenCalledOnce();
    expect(textResponse).not.toHaveBeenCalled();
    expect(blobConstructor).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(pngBlob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:png');
  });

  it('reports a PNG fetch failure and does not cache the rejected request', async () => {
    const pack = makePack('pack:png-failure');
    const asset = { ...pack.cursors[0]!, format: 'png' as const };
    const failure = new Error('PNG unavailable');
    const blobResponse = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: blobResponse });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Image', LoadingImage);
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:png-retry'), revokeObjectURL: vi.fn() });

    const cursor = useCursorReplacer();
    await expect(cursor.getCursorImage(pack, asset, 80, 40, '#ff00ff')).rejects.toBe(failure);
    await cursor.getCursorImage(pack, asset, 80, 40, '#ff00ff');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(blobResponse).toHaveBeenCalledTimes(2);
  });

  it('preserves original colours and does not split the cache by requested colour', async () => {
    const pack = makePack('pack:original', 'Original', 'original');
    const asset = pack.cursors[0]!;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('<svg viewBox="0 0 32 16"><path fill="#00ff00"/></svg>'),
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:original');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Image', LoadingImage);
    vi.stubGlobal('Blob', SvgBlob);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });

    const cursor = useCursorReplacer();
    const firstImage = await cursor.getCursorImage(pack, asset, 64, 32, '#ff00ff');
    const secondImage = await cursor.getCursorImage(pack, asset, 64, 32, '#0000ff');
    const svg = (createObjectURL.mock.calls[0]?.[0] as SvgBlob).value;

    expect(secondImage).toBe(firstImage);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(svg).toContain('#00ff00');
    expect(svg).not.toContain('#ff00ff');
    expect(svg).not.toContain('color="#ff00ff"');
  });

  it('reports unavailable assets and undecodable SVGs with the asset URL', async () => {
    const missingPack = makePack('pack:missing');
    const missingAsset = missingPack.cursors[0]!;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(useCursorReplacer().getCursorImage(missingPack, missingAsset, 24, 12, '#000000')).rejects.toThrow(
      `Unable to load cursor asset: ${missingAsset.url} (404)`,
    );

    const invalidPack = makePack('pack:invalid');
    const invalidAsset = invalidPack.cursors[0]!;
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('<svg/>'),
      }),
    );
    vi.stubGlobal('Image', FailingImage);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:invalid'),
      revokeObjectURL,
    });

    await expect(useCursorReplacer().getCursorImage(invalidPack, invalidAsset, 24, 12, '#000000')).rejects.toThrow(
      `Unable to decode cursor asset: ${invalidAsset.url}`,
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invalid');
  });
});
