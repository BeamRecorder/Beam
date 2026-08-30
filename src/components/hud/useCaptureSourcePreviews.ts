import { ref, type Ref } from 'vue';
import { capture } from '../../api/capture';
import { rememberCaptureCatalog } from '../../api/capture-diagnostics';
import type {
  CaptureCatalog,
  CapturePreview,
  CaptureSource,
  RecorderLauncherContext,
} from '../../api/types/capture-api';
import { loadNativeSourcePreviews } from './native-source-previews';

export type PreviewKind = 'screen' | 'window';

interface CaptureSourcePreviewOptions {
  platform: string;
  sources: Ref<CaptureSource[]>;
  catalog: Ref<CaptureCatalog | null>;
  selectedScreenId: Ref<string | null>;
  selectedWindowId: Ref<string | null>;
  recorderLauncherContext: () => RecorderLauncherContext | null | undefined;
}

export const useCaptureSourcePreviews = (options: CaptureSourcePreviewOptions) => {
  const windowPreviews = ref<CapturePreview[]>([]);
  const screenPreviews = ref<CapturePreview[]>([]);
  const windowPreviewsLoading = ref(false);
  const screenPreviewsLoading = ref(false);
  const loaded: Record<PreviewKind, boolean> = { screen: false, window: false };
  const requests: Record<PreviewKind, Promise<void> | null> = { screen: null, window: null };
  let catalogRequest: Promise<void> | null = null;

  const previewSources = (type: PreviewKind) =>
    options.sources.value.filter((source) => source.kind === (type === 'screen' ? 'display' : 'window'));

  const refreshNativeCatalog = (): Promise<void> => {
    if (options.platform !== 'darwin') return Promise.resolve();
    if (catalogRequest) return catalogRequest;
    catalogRequest = capture
      .discover()
      .then((catalog) => {
        options.catalog.value = catalog;
        rememberCaptureCatalog(catalog);
        const retained = options.sources.value.filter(
          (source) => source.kind !== 'display' && source.kind !== 'window' && source.kind !== 'application',
        );
        options.sources.value = [...(Array.isArray(catalog.sources) ? catalog.sources : []), ...retained];
        if (!previewSources('screen').some((source) => source.id === options.selectedScreenId.value)) {
          options.selectedScreenId.value =
            previewSources('screen').find((source) => source.isDefault)?.id ?? previewSources('screen')[0]?.id ?? null;
        }
        if (!previewSources('window').some((source) => source.id === options.selectedWindowId.value)) {
          options.selectedWindowId.value = null;
        }
      })
      .catch((error) => console.error('Failed to refresh native capture sources:', error))
      .finally(() => {
        catalogRequest = null;
      });
    return catalogRequest;
  };

  const loadPreviews = (type: PreviewKind, force = false, refreshNative = false): Promise<void> => {
    if (!force && loaded[type]) return Promise.resolve();
    if (requests[type]) return requests[type];
    const target = type === 'screen' ? screenPreviews : windowPreviews;
    const loading = type === 'screen' ? screenPreviewsLoading : windowPreviewsLoading;
    if (target.value.length === 0) loading.value = true;
    const wasLoaded = loaded[type];
    const operation =
      options.platform === 'darwin'
        ? loadNativeSourcePreviews(capture, previewSources(type), target.value, refreshNative)
        : capture.getSources([type]);
    const request = operation
      .then((results) => {
        target.value = results;
        loaded[type] = true;
        if (type !== 'window') return;
        const windows = previewSources('window');
        if (options.platform === 'darwin') {
          if (
            options.selectedWindowId.value &&
            !windows.some((source) => source.id === options.selectedWindowId.value)
          ) {
            options.selectedWindowId.value = null;
          } else if (!wasLoaded && !options.selectedWindowId.value && !options.recorderLauncherContext()) {
            options.selectedWindowId.value = windows[0]?.id ?? null;
          }
          return;
        }
        const selectedPortalSource = windows.some(
          (source) => source.id === options.selectedWindowId.value && source.selectionMode === 'portal',
        );
        if (
          !selectedPortalSource &&
          (!options.selectedWindowId.value || !results.some((result) => result.id === options.selectedWindowId.value))
        ) {
          options.selectedWindowId.value = options.recorderLauncherContext() ? null : (results[0]?.id ?? null);
        }
      })
      .catch((error) => console.error(`Failed to load ${type} previews:`, error))
      .finally(() => {
        loading.value = false;
        requests[type] = null;
      });
    requests[type] = request;
    return request;
  };

  const refreshSourceChoices = async (type: PreviewKind, refreshPreviews = false) => {
    await refreshNativeCatalog();
    await loadPreviews(type, true, refreshPreviews);
  };

  return {
    loadPreviews,
    refreshSourceChoices,
    screenPreviews,
    screenPreviewsLoading,
    windowPreviews,
    windowPreviewsLoading,
  };
};
