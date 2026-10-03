import { onMounted, onScopeDispose, ref } from 'vue';
import type { CaptureMode } from '@beam/engine/capture/capture-mode';
import { capture } from '~/api/capture';
import { usePreferencesStore } from '~/stores/preferences';
import { useThemeStore } from '~/stores/theme';
import { useLocaleStore } from '~/stores/locale';
import { useTranslate } from '~/i18n/useTranslate';
import { ONBOARDING_STEPS } from './onboarding-types';

export function useOnboarding() {
  const { t } = useTranslate('Onboarding');
  const preferences = usePreferencesStore();
  const theme = useThemeStore();
  const locale = useLocaleStore();
  const step = ref(0);
  const mode = ref<CaptureMode>('studio');
  const loading = ref(true);
  const loadFailed = ref(false);
  const busy = ref(false);
  const error = ref('');
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });

  const load = async () => {
    if (disposed || busy.value) return;
    loading.value = true;
    loadFailed.value = false;
    error.value = '';
    try {
      await theme.ready;
      const settings = preferences.settings ?? (await preferences.load());
      const saved = settings.extras.captureMode;
      if (!disposed && (saved === 'studio' || saved === 'screenshot' || saved === 'instant')) mode.value = saved;
    } catch (reason) {
      if (!disposed) {
        loadFailed.value = true;
        error.value = reason instanceof Error ? reason.message : t('saveError');
      }
    } finally {
      if (!disposed) loading.value = false;
    }
  };
  onMounted(() => {
    void load();
  });

  const navigate = (delta: number) => {
    if (busy.value || loading.value || loadFailed.value) return;
    error.value = '';
    step.value = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, step.value + delta));
  };
  const finish = async (dismiss = false) => {
    if (busy.value || disposed || ((loading.value || loadFailed.value) && !dismiss)) return;
    busy.value = true;
    error.value = '';
    try {
      if (dismiss) await capture.closeOnboarding();
      else {
        await preferences.update({
          theme: theme.theme,
          appearance: { ...theme.appearance, theme: theme.theme },
          extras: { captureMode: mode.value, locale: locale.locale },
        });
        await capture.completeOnboarding();
      }
    } catch (reason) {
      if (!disposed) error.value = reason instanceof Error ? reason.message : t('saveError');
    } finally {
      if (!disposed) busy.value = false;
    }
  };

  return { step, mode, loading, loadFailed, busy, error, load, navigate, finish };
}
