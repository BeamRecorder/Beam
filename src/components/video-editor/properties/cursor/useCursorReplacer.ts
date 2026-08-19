import { computed, ref } from 'vue';
import type { ShadowDirection } from './shadow-types';
import { createDefaultCursorClickEffects, type CursorClickEffects } from '../../../../api/types/cursor-settings';
import type { CursorAssetDescriptor, CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import { MACOS_CURSOR_PACK, orderedCursorPacks } from './cursor-packs';
import { CURSOR_SIZE_DEFAULT } from './cursor-size';
import { loadCursorImage } from './cursor-image-loader';

export function useCursorReplacer() {
  const selection = ref<CursorSelection>({ packId: MACOS_CURSOR_PACK.id, mode: 'automatic', cursorId: null });
  const importedPacks = ref<CursorPackDescriptor[]>([]);
  const packs = computed(() => orderedCursorPacks(importedPacks.value));
  const selectedPack = computed(() => packs.value.find((pack) => pack.id === selection.value.packId) ?? null);
  const cursorSize = ref(CURSOR_SIZE_DEFAULT);
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
    return loadCursorImage(pack, asset, rasterWidth, rasterHeight, color);
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
