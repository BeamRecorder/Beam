import { ref } from "vue";
import type {
  CaptionFontOption,
  FontCatalogErrorCode,
} from "../../../apps/desktop/src/components/editor/properties/captions/font-catalog-types";
import fontUrl from "../assets/HankenGrotesk.ttf";
// The offline film has a frozen font library. It never impersonates Electron's capture API.
export function useFontCatalog() {
  return {
    fonts: ref<CaptionFontOption[]>([
      { value: "sans-serif", label: "Beam Sans" },
      {
        value: "Hanken Grotesk",
        label: "Hanken Grotesk",
        assetId: "studio-hanken",
        url: fontUrl,
      },
    ]),
    loading: ref(false),
    error: ref<FontCatalogErrorCode | null>(null),
    async refreshSystem() {
      throw new Error(
        "OS font enumeration is unavailable in the offline film.",
      );
    },
    async importFont() {
      throw new Error("Font import requires the native editor.");
    },
  };
}
export async function loadCaptionFont(font: CaptionFontOption) {
  if (!font.url) return;
  const face = new FontFace(font.value, `url("${font.url}")`);
  await face.load();
  document.fonts.add(face);
}
