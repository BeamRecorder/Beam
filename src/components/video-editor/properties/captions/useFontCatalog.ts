import { onBeforeUnmount, onMounted, ref } from 'vue';
import { capture } from '~/api/capture';
import type { ImportedFont } from '~/api/types/capture-api';
import type { CaptionFontOption, FontCatalogErrorCode, LocalFontWindow } from './font-catalog-types';
const loadedImportedFonts = new Set<string>();
const loadingImportedFonts = new Map<string, Promise<void>>();

export const loadCaptionFont = async (font: CaptionFontOption) => {
  if (!font.assetId || !font.url) return;
  if (loadedImportedFonts.has(font.assetId)) return;
  const existing = loadingImportedFonts.get(font.assetId);
  if (existing) return existing;
  const loading = (async () => {
    const face = new FontFace(font.value, `url("${font.url}")`);
    await face.load();
    document.fonts.add(face);
    loadedImportedFonts.add(font.assetId!);
  })();
  loadingImportedFonts.set(font.assetId, loading);
  try {
    await loading;
  } finally {
    loadingImportedFonts.delete(font.assetId);
  }
};

export function useFontCatalog() {
  const fonts = ref<CaptionFontOption[]>([{ value: 'sans-serif', label: 'Beam Sans' }]);
  const loading = ref(false);
  const error = ref<FontCatalogErrorCode | null>(null);
  let imported: ImportedFont[] = [];
  let systemFamilies: string[] = [];
  let pendingRequests = 0;
  let importedRequest = 0;
  let systemRequest = 0;
  const beginRequest = () => {
    pendingRequests += 1;
    loading.value = true;
  };
  const endRequest = () => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    loading.value = pendingRequests > 0;
  };
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
    const request = ++importedRequest;
    beginRequest();
    try {
      const nextImported = await capture.listImportedFonts();
      if (request !== importedRequest) return false;
      imported = nextImported;
      if (error.value === 'fontLibraryReadFailed') error.value = null;
      rebuild();
      return true;
    } catch {
      if (request === importedRequest) error.value = 'fontLibraryReadFailed';
      return false;
    } finally {
      endRequest();
    }
  };
  const refreshSystem = async () => {
    const query = (window as LocalFontWindow).queryLocalFonts;
    if (!query) {
      error.value = 'localFontsUnavailable';
      return;
    }
    const request = ++systemRequest;
    beginRequest();
    try {
      const records = await query();
      if (request !== systemRequest) return;
      systemFamilies = records.map((font) => font.family).sort((a, b) => a.localeCompare(b));
      if (error.value === 'localFontsUnavailable' || error.value === 'localFontsPermissionDenied') error.value = null;
      rebuild();
    } catch (cause) {
      if (request !== systemRequest) return;
      error.value =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'localFontsPermissionDenied'
          : 'fontLoadFailed';
    } finally {
      endRequest();
    }
  };
  const importFont = async () => {
    beginRequest();
    try {
      const font = await capture.pickImportedFont();
      if (!font) return null;
      if (!(await refreshImported())) return null;
      const option = fonts.value.find((item) => item.assetId === font.id) ?? null;
      if (option) await loadCaptionFont(option);
      error.value = null;
      return option;
    } catch {
      error.value = 'fontImportFailed';
      return null;
    } finally {
      endRequest();
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
