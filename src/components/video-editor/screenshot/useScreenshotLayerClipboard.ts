import { ref, type Ref, type ShallowRef } from 'vue';
import type { ScreenshotState } from '~/api/types/screenshot';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
import { useTranslate } from '~/i18n/useTranslate';
import { useToastStore } from '~/ui/toast/toastStore';
import { removeScreenshotLayer } from './screenshot-layers';
import { copyScreenshotLayerSelection, pasteScreenshotLayerSelection } from './screenshot-layer-clipboard';
import type { ScreenshotLayerClipboard } from './screenshot-layer-clipboard-types';

const TOAST_DURATION_MS = 1_500;

export function useScreenshotLayerClipboard(options: {
  state: Ref<ScreenshotState | null>;
  selectedIds: ShallowRef<string[]>;
  selectedId: Ref<string | null>;
  disabled: () => boolean;
  reconcileSelection: () => void;
  showSelection: (id: string | null) => void;
}) {
  const { t } = useTranslate('VideoEditor');
  const toast = useToastStore();
  const clipboard = ref<ScreenshotLayerClipboard | null>(null);
  const describe = (names: readonly string[]) => names.join(', ');
  const copy = (removableOnly = false) => {
    if (!options.state.value || options.disabled()) return false;
    const next = copyScreenshotLayerSelection(
      options.state.value,
      options.selectedIds.value,
      options.selectedId.value,
      removableOnly,
    );
    if (!next) return false;
    clipboard.value = next;
    toast.success(
      t('timelineCopiedItem', { item: describe(next.entries.map((entry) => entry.name)) }),
      TOAST_DURATION_MS,
      undefined,
      { leadingIcon: 'copy' },
    );
    return true;
  };
  const cut = () => {
    if (!copy(true) || !options.state.value || !clipboard.value) return false;
    beginPropertyInteraction();
    try {
      for (const entry of clipboard.value.entries) removeScreenshotLayer(options.state.value, entry.layer.value.id);
      options.reconcileSelection();
      options.showSelection(options.selectedId.value);
    } finally {
      endPropertyInteraction();
    }
    return true;
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
      });
    } catch (error) {
      toast.error(t('timelinePasteFailed', { message: error instanceof Error ? error.message : String(error) }), 5_000);
    } finally {
      endPropertyInteraction();
    }
    return true;
  };
  return { copy, cut, paste };
}
