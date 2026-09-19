import { ref, type Ref, type ShallowRef } from 'vue';
import type { ScreenshotState } from '~/api/types/screenshot';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
import { useTranslate } from '~/i18n/useTranslate';
import { useToastStore } from '~/ui/toast/toastStore';
import { screenshotClipboardPreview } from '../clipboard/clipboard-preview';
import { syncInternalEditorClipboard } from '../composables/internal-editor-clipboard';
import {
  removeScreenshotLayer,
  SCREENSHOT_BACKGROUND_ID,
  SCREENSHOT_WATERMARK_ID,
  screenshotLayers,
} from './screenshot-layers';
import {
  capturedScreenshotClipboardLayer,
  copyScreenshotLayerSelection,
  pasteScreenshotLayerSelection,
} from './screenshot-layer-clipboard';
import { rasterizeScreenshotLayer } from './screenshot-layer-clipboard-raster';
import type {
  ScreenshotClipboardSource,
  ScreenshotLayerClipboard,
  ScreenshotSpecialLayerCopies,
} from './screenshot-layer-clipboard-types';

const TOAST_DURATION_MS = 2_400;

export function useScreenshotLayerClipboard(options: {
  state: Ref<ScreenshotState | null>;
  selectedIds: ShallowRef<string[]>;
  selectedId: Ref<string | null>;
  source: () => ScreenshotClipboardSource | null;
  disabled: () => boolean;
  reconcileSelection: () => void;
  showSelection: (id: string | null) => void;
}) {
  const { t } = useTranslate('VideoEditor');
  const { t: layerText } = useTranslate('ScreenshotComposition');
  const toast = useToastStore();
  const clipboard = ref<ScreenshotLayerClipboard | null>(null);
  const describe = (names: readonly string[]) => names.join(', ');
  const store = (
    state: ScreenshotState,
    selectedIds: readonly string[],
    selectedId: string | null,
    requireUnlocked: boolean,
    specialLayers: ScreenshotSpecialLayerCopies,
  ) => {
    const next = copyScreenshotLayerSelection(state, selectedIds, selectedId, requireUnlocked, specialLayers);
    if (!next) return false;
    clipboard.value = next;
    const description = describe(next.entries.map((entry) => entry.name));
    syncInternalEditorClipboard(description);
    toast.success(t('timelineCopiedItem', { item: description }), TOAST_DURATION_MS, undefined, {
      leadingIcon: 'copy',
      preview: screenshotClipboardPreview(next),
    });
    return true;
  };
  const copy = (requireUnlocked = false): boolean | Promise<boolean> => {
    if (!options.state.value || options.disabled()) return false;
    const state = JSON.parse(JSON.stringify(options.state.value)) as ScreenshotState;
    const selectedIds = [...options.selectedIds.value];
    const selectedId = options.selectedId.value;
    const specialLayers: ScreenshotSpecialLayerCopies = {};
    const source = options.source();
    if (source && selectedIds.includes(state.image.id))
      specialLayers.capturedImage = capturedScreenshotClipboardLayer(state, source);
    const selected = new Set(selectedIds);
    const specialIds = screenshotLayers(state)
      .filter(
        (layer) =>
          selected.has(layer.id) && (layer.id === SCREENSHOT_BACKGROUND_ID || layer.id === SCREENSHOT_WATERMARK_ID),
      )
      .map((layer) => layer.id as typeof SCREENSHOT_BACKGROUND_ID | typeof SCREENSHOT_WATERMARK_ID);
    if (!specialIds.length) return store(state, selectedIds, selectedId, requireUnlocked, specialLayers);

    return Promise.all(
      specialIds.map(async (id) => {
        const copy = await rasterizeScreenshotLayer(
          state,
          id,
          layerText(id === SCREENSHOT_BACKGROUND_ID ? 'background' : 'watermark'),
        );
        if (id === SCREENSHOT_BACKGROUND_ID) specialLayers.background = copy;
        else specialLayers.watermark = copy;
      }),
    )
      .then(() => store(state, selectedIds, selectedId, requireUnlocked, specialLayers))
      .catch((error) => {
        toast.error(`${t('mediaPlaybackCopyError')}: ${error instanceof Error ? error.message : String(error)}`, 5_000);
        return false;
      });
  };
  const removeCopiedSelection = (ids: readonly string[]) => {
    if (!options.state.value || !clipboard.value) return false;
    beginPropertyInteraction();
    try {
      for (const id of ids) removeScreenshotLayer(options.state.value, id);
      options.reconcileSelection();
      options.showSelection(options.selectedId.value);
    } finally {
      endPropertyInteraction();
    }
    return true;
  };
  const cut = (): boolean | Promise<boolean> => {
    const ids = [...options.selectedIds.value];
    const copied = copy(true);
    return copied instanceof Promise
      ? copied.then((success) => success && removeCopiedSelection(ids))
      : copied && removeCopiedSelection(ids);
  };
  const paste = () => {
    if (!options.state.value || options.disabled() || !clipboard.value) return false;
    beginPropertyInteraction();
    try {
      const result = pasteScreenshotLayerSelection(options.state.value, clipboard.value);
      options.selectedIds.value = [...result.ids.filter((id) => id !== result.primaryId), result.primaryId];
      options.showSelection(result.primaryId);
      toast.success(t('timelinePastedItem', { item: describe(result.names) }), TOAST_DURATION_MS, undefined, {
        leadingIcon: 'paste',
        preview: screenshotClipboardPreview(clipboard.value),
      });
    } catch (error) {
      toast.error(t('timelinePasteFailed', { message: error instanceof Error ? error.message : String(error) }), 5_000);
    } finally {
      endPropertyInteraction();
    }
    return true;
  };
  const canPaste = () => Boolean(options.state.value && !options.disabled() && clipboard.value);
  return { copy, cut, paste, canPaste };
}
