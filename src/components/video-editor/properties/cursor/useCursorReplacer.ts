import { computed, ref } from 'vue';
import type { ShadowDirection } from './shadow-types';
import { createDefaultCursorClickEffects, type CursorClickEffects } from '../../../../api/types/cursor-settings';
import type { CursorAssetDescriptor, CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import { MACOS_CURSOR_PACK, orderedCursorPacks } from './cursor-packs';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

const svgAtRasterSize = (svg: string, width: number, height: number, color: string, tintable: boolean) => {
  const tintReadySvg = tintable
    ? svg
        .replace(/(fill|stroke|stop-color)\s*=\s*(["'])(?:#000(?:000)?|black)\2/gi, '$1=$2currentColor$2')
        .replace(/((?:fill|stroke|stop-color)\s*:\s*)(?:#000(?:000)?|black)(?=\s*(?:;|["']))/gi, '$1currentColor')
    : svg;
  return tintReadySvg.replace(/<svg\b([^>]*)>/i, (_tag, attributes: string) => {
    const clean = attributes.replace(/\s(?:width|height)=["'][^"']*["']/gi, '');
    return (
      `<svg${clean} width="${Math.max(1, Math.ceil(width))}" height="${Math.max(1, Math.ceil(height))}"` +
      (tintable ? ` color="${color}"` : '') +
      '>'
    );
  });
};

export function useCursorReplacer() {
  const selection = ref<CursorSelection>({ packId: MACOS_CURSOR_PACK.id, mode: 'automatic', cursorId: null });
  const importedPacks = ref<CursorPackDescriptor[]>([]);
  const packs = computed(() => orderedCursorPacks(importedPacks.value));
  const selectedPack = computed(() => packs.value.find((pack) => pack.id === selection.value.packId) ?? null);
  const cursorSize = ref(45);
  const cursorColor = ref('#000000');
  const enableShadow = ref(true);
  const shadowBlur = ref(6);
  const shadowColor = ref('#000000');
  const shadowDirection = ref<ShadowDirection>('bottom');
  const clickEffects = ref<CursorClickEffects>(createDefaultCursorClickEffects());

  const getCursorImage = async (
    pack: CursorPackDescriptor,
    asset: CursorAssetDescriptor,
    rasterWidth: number,
    rasterHeight: number,
    color: string,
  ): Promise<HTMLImageElement> => {
    const key = `${pack.id}:${asset.id}:${Math.ceil(rasterWidth)}x${Math.ceil(rasterHeight)}:${pack.colorMode === 'tintable' ? color : 'original'}`;
    const cached = imageCache.get(key);
    if (cached) return cached;
    const loading = (async () => {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error(`Unable to load cursor asset: ${asset.url} (${response.status})`);
      const svg = svgAtRasterSize(
        await response.text(),
        rasterWidth,
        rasterHeight,
        color,
        pack.colorMode === 'tintable',
      );
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error(`Unable to decode cursor asset: ${asset.url}`));
        };
        image.src = url;
      });
    })();
    imageCache.set(key, loading);
    try {
      return await loading;
    } catch (error) {
      imageCache.delete(key);
      throw error;
    }
  };

  return {
    selection,
    importedPacks,
    packs,
    selectedPack,
    cursorSize,
    cursorColor,
    enableShadow,
    shadowBlur,
    shadowColor,
    shadowDirection,
    clickEffects,
    getCursorImage,
  };
}
