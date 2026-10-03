import { computed, onMounted, ref } from 'vue';
import { capture } from '~/api/capture';
import { usePreferencesStore } from '~/stores/preferences';
import { usesExperimentalLinuxFfmpeg } from './export-backend-preference';
import type { DesktopVideoExportBackend } from './experimental-export-types';

export function useExportBackendPreference() {
  const preferences = usePreferencesStore();
  const available = capture.platform === 'linux';
  const loading = ref(available && preferences.settings === null);
  const saving = ref(false);
  const error = ref('');
  const ready = computed(() => !available || preferences.settings !== null);
  const busy = computed(() => loading.value || saving.value);
  const enabled = computed(() => usesExperimentalLinuxFfmpeg(preferences.settings, capture.platform));

  onMounted(async () => {
    if (!loading.value) return;
    try {
      await preferences.load();
    } catch (reason) {
      error.value = String(reason);
    } finally {
      loading.value = false;
    }
  });

  const setEnabled = async (value: boolean) => {
    if (!available || busy.value || !ready.value) return;
    saving.value = true;
    error.value = '';
    const backend: DesktopVideoExportBackend = value ? 'ffmpeg-vaapi' : 'webcodecs';
    try {
      await preferences.update({ extras: { videoExportBackend: backend } });
    } catch (reason) {
      error.value = String(reason);
    } finally {
      saving.value = false;
    }
  };

  return { available, enabled, ready, busy, error, setEnabled };
}
