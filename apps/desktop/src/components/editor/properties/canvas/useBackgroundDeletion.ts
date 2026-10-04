import { computed, onMounted, onUnmounted, ref } from 'vue';
import { capture } from '../../../../api/capture';
import type { PreferenceSettings } from '../../../../api/types/capture-api';
import type { BackgroundCatalogHistory, BackgroundCatalogRequest } from '../../../../api/types/background-catalog';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import { useTranslate } from '~/i18n/useTranslate';

export function useBackgroundDeletion() {
  const { t } = useTranslate('BackgroundDeletion');
  const hidden = ref(new Set<string>());
  const history = ref<BackgroundCatalogHistory | null>(null);
  const target = ref<BackgroundValue | null>(null);
  const busy = ref(false);
  const error = ref('');
  let disposed = false;
  let revision = 0;
  let unsubscribe: (() => void) | undefined;
  const sync = (preferences: PreferenceSettings) => {
    revision++;
    const ids = preferences.extras.hiddenBackgroundIds;
    hidden.value = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
    const receipt = preferences.extras.backgroundCatalogHistory as BackgroundCatalogHistory | null;
    history.value =
      receipt?.version === 1 && typeof receipt.id === 'string' && typeof receipt.deleted === 'boolean'
        ? { version: 1, id: receipt.id, deleted: receipt.deleted }
        : null;
  };
  const canDelete = (item: BackgroundValue) =>
    item.kind === 'color' || item.kind === 'gradient' || item.id.startsWith(`user-wallpaper:${item.kind}:`);
  const isHidden = (id: string) => hidden.value.has(id);
  const request = (item: BackgroundValue) => {
    if (busy.value || !canDelete(item) || isHidden(item.id)) return;
    // Freeze the item shown in the confirmation even if the selection changes.
    target.value = JSON.parse(JSON.stringify(item)) as BackgroundValue;
    error.value = '';
  };
  const cancel = () => {
    if (!busy.value) {
      target.value = null;
      error.value = '';
    }
  };
  const apply = async (operation: BackgroundCatalogRequest['operation'], id: string) => {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      const preferences = await capture.updateBackgroundCatalog({ operation, id });
      if (!disposed) {
        sync(preferences);
        target.value = null;
      }
    } catch {
      if (!disposed) error.value = t('error');
    } finally {
      if (!disposed) busy.value = false;
    }
  };
  const confirm = () => (target.value ? apply('remove', target.value.id) : Promise.resolve());
  const undo = () => (history.value?.deleted ? apply('undo', history.value.id) : Promise.resolve());
  const redo = () => (history.value && !history.value.deleted ? apply('redo', history.value.id) : Promise.resolve());
  onMounted(() => {
    const initialRevision = revision;
    unsubscribe = capture.onPreferencesChanged(sync);
    void capture
      .getPreferences()
      .then((preferences) => {
        if (!disposed && revision === initialRevision) sync(preferences);
      })
      .catch(() => {
        if (!disposed) error.value = t('loadError');
      });
  });
  onUnmounted(() => {
    disposed = true;
    unsubscribe?.();
  });
  return {
    target,
    busy,
    error,
    canDelete,
    isHidden,
    request,
    cancel,
    confirm,
    undo,
    redo,
    hasHistory: computed(() => Boolean(history.value)),
    canUndo: computed(() => Boolean(history.value?.deleted)),
    canRedo: computed(() => Boolean(history.value && !history.value.deleted)),
  };
}
