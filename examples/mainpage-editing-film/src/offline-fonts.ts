import { ref } from 'vue';
import type {
  CaptionFontOption,
  FontCatalogErrorCode,
} from '../../../apps/desktop/src/components/editor/properties/captions/font-catalog-types';
import fontUrl from '../assets/HankenGrotesk.ttf';
export const projectFontSource = () => fontUrl;
export function useFontCatalog() {
  return {
    fonts: ref<CaptionFontOption[]>([
      { value: 'sans-serif', label: 'Beam Sans' },
      { value: 'Hanken Grotesk', label: 'Hanken Grotesk', url: fontUrl, assetId: 'film-hanken' },
    ]),
    loading: ref(false),
    error: ref<FontCatalogErrorCode | null>(null),
    async refreshSystem() {
      throw new Error('The offline film host has no native font enumeration.');
    },
    async importFont() {
      throw new Error('Import fonts in Beam before freezing this film.');
    },
  };
}
export async function loadCaptionFont(font: CaptionFontOption) {
  if (!font.url) return;
  const face = new FontFace(font.value, `url("${font.url}")`);
  await face.load();
  document.fonts.add(face);
}
