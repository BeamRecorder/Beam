import { onBeforeUnmount, ref } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useToastStore } from '~/ui/toast/toastStore';
import type { TimelinePasteHighlight } from './timeline-clipboard-types';

const PASTE_HIGHLIGHT_DURATION_MS = 900;
const SUCCESS_TOAST_DURATION_MS = 1_500;
const ERROR_TOAST_DURATION_MS = 5_000;

export const useTimelineClipboardFeedback = () => {
  const { t } = useTranslate('VideoEditor');
  const toast = useToastStore();
  const recentPaste = ref<TimelinePasteHighlight | null>(null);
  let recentPasteTimer: ReturnType<typeof setTimeout> | null = null;

  const reportCopySuccess = () => toast.success(t('timelineCopied'), SUCCESS_TOAST_DURATION_MS);
  const reportPasteError = (message: string) =>
    toast.error(t('timelinePasteFailed', { message }), ERROR_TOAST_DURATION_MS);
  const reportPasteSuccess = (type: TimelinePasteHighlight['type'], id: string) => {
    recentPaste.value = { type, id, timestamp: Date.now() };
    if (recentPasteTimer) clearTimeout(recentPasteTimer);
    recentPasteTimer = setTimeout(() => {
      recentPaste.value = null;
      recentPasteTimer = null;
    }, PASTE_HIGHLIGHT_DURATION_MS);
    toast.success(t('timelinePasted'), SUCCESS_TOAST_DURATION_MS);
  };

  onBeforeUnmount(() => {
    if (recentPasteTimer) clearTimeout(recentPasteTimer);
  });

  return { recentPaste, reportCopySuccess, reportPasteError, reportPasteSuccess };
};
