import { onBeforeUnmount, onMounted, ref } from 'vue';
import { capture } from '~/api/capture';
import type { ImportedFont } from '~/api/types/capture-api';

export interface CaptionFontOption {
  value: string;
  label: string;
  assetId?: string;
  url?: string;
}

type LocalFontRecord = { family: string };
type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<LocalFontRecord[]> };
const loadedImportedFonts = new Set<string>();

export const loadCaptionFont = async (font: CaptionFontOption) => {
  if (!font.assetId || !font.url) return;
  if (loadedImportedFonts.has(font.assetId)) return;
  const face = new FontFace(font.label, `url("${font.url}")`);
  await face.load();
  document.fonts.add(face);
  loadedImportedFonts.add(font.assetId);
};

export function useFontCatalog() {
  const fonts = ref<CaptionFontOption[]>([{ value: 'sans-serif', label: 'Beam Sans' }]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let imported: ImportedFont[] = [];
  let systemFamilies: string[] = [];
  const rebuild = () => {
    const seen = new Set<string>();
    fonts.value = [
      { value: 'sans-serif', label: 'Beam Sans' },
      ...imported.map((font) => ({ value: font.family, label: font.family, assetId: font.id, url: font.url })),
      ...systemFamilies.map((family) => ({ value: family, label: family })),
    ].filter((font) => {
      const key = font.value.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const refreshImported = async () => {
    try {
      imported = await capture.listImportedFonts();
      rebuild();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unable to read the imported font library.';
    }
  };
  const refreshSystem = async () => {
    const query = (window as LocalFontWindow).queryLocalFonts;
    if (!query) {
      error.value = 'Local font access is unavailable.';
      return;
    }
    loading.value = true;
    try {
      const records = await query();
      systemFamilies = records.map((font) => font.family).sort((a, b) => a.localeCompare(b));
      error.value = null;
      rebuild();
    } catch {
      error.value = 'Permission to access installed fonts was denied.';
    } finally {
      loading.value = false;
    }
  };
  const importFont = async () => {
    loading.value = true;
    try {
      const font = await capture.pickImportedFont();
      if (!font) return null;
      await refreshImported();
      const option = fonts.value.find((item) => item.assetId === font.id) ?? null;
      if (option) await loadCaptionFont(option);
      error.value = null;
      return option;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unable to import this font.';
      return null;
    } finally {
      loading.value = false;
    }
  };
  const onFocus = () => void refreshSystem();
  let stopLibrary: (() => void) | undefined;
  onMounted(() => {
    void refreshImported();
    window.addEventListener('focus', onFocus);
    stopLibrary = capture.onFontLibraryChanged(() => void refreshImported());
  });
  onBeforeUnmount(() => {
    window.removeEventListener('focus', onFocus);
    stopLibrary?.();
  });
  return { fonts, loading, error, refreshSystem, importFont };
}
