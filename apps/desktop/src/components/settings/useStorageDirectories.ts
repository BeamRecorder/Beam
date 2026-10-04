import { computed, onMounted, onScopeDispose, ref } from 'vue';
import { capture } from '~/api/capture';
import type { DirectoryKind, DirectorySettings, DirectorySnapshot } from '~/api/types/storage-directories';

export function useStorageDirectories() {
  const snapshot = ref<DirectorySnapshot | null>(null);
  const loading = ref(true);
  const saving = ref(false);
  const error = ref('');
  let disposed = false;
  let latestSettings: DirectorySettings | null = null;
  let revision = 0;
  let unsubscribe: (() => void) | undefined;
  const apply = (next: DirectorySnapshot, startedAt: number) => {
    if (!disposed) snapshot.value = revision > startedAt ? { ...next, ...latestSettings } : next;
  };
  const load = async () => {
    if (saving.value || disposed) return;
    loading.value = true;
    error.value = '';
    const startedAt = revision;
    try {
      apply(await capture.getDirectories(), startedAt);
    } catch (reason) {
      if (!disposed) error.value = String(reason);
    } finally {
      if (!disposed) loading.value = false;
    }
  };
  onMounted(() => {
    unsubscribe = capture.onPreferencesChanged((preferences) => {
      if (!preferences.directories) return;
      latestSettings = preferences.directories;
      revision++;
      if (snapshot.value) snapshot.value = { ...snapshot.value, ...latestSettings };
    });
    void load();
  });
  onScopeDispose(() => {
    disposed = true;
    unsubscribe?.();
  });
  const change = async (kind: DirectoryKind, directory?: string | null) => {
    if (loading.value || saving.value || !snapshot.value || disposed) return;
    saving.value = true;
    error.value = '';
    const startedAt = revision;
    try {
      const next =
        directory === undefined
          ? await capture.chooseDirectory(kind)
          : await capture.selectDirectory({ kind, directory });
      if (next) apply(next, startedAt);
    } catch (reason) {
      if (!disposed) error.value = String(reason);
    } finally {
      if (!disposed) saving.value = false;
    }
  };
  return {
    snapshot,
    loading,
    error,
    load,
    busy: computed(() => loading.value || saving.value),
    choose: (kind: DirectoryKind) => change(kind),
    select: (kind: DirectoryKind, directory: string | null) => change(kind, directory),
  };
}
