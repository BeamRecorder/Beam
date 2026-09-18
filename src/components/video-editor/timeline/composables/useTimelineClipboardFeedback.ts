import { onBeforeUnmount, ref } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useToastStore } from '~/ui/toast/toastStore';
import { timelineClipboardPreview } from '../../clipboard/clipboard-preview';
import { syncInternalEditorClipboard } from '../../composables/internal-editor-clipboard';
import type {
  TimelineClipboardDescriptor,
  TimelineClipboardItem,
  TimelinePasteHighlight,
} from './timeline-clipboard-types';

const PASTE_HIGHLIGHT_DURATION_MS = 900;
const SUCCESS_TOAST_DURATION_MS = 2_400;
const ERROR_TOAST_DURATION_MS = 5_000;

export const useTimelineClipboardFeedback = () => {
  const { t } = useTranslate('VideoEditor');
  const toast = useToastStore();
  const recentPaste = ref<TimelinePasteHighlight | null>(null);
  let recentPasteTimer: ReturnType<typeof setTimeout> | null = null;

  const describeItem = (descriptor: TimelineClipboardDescriptor): string => {
    if (descriptor.kind === 'caption') return t('timelineClipboardCaption', { text: descriptor.text });
    if (descriptor.kind === 'zoom') return t('timelineClipboardZoom', { number: descriptor.number });
    if (descriptor.kind === 'selection') return descriptor.items.map(describeItem).join(', ');
    return descriptor.name;
  };
  const reportCopySuccess = (item: TimelineClipboardItem) => {
    const description = describeItem(item.descriptor);
    syncInternalEditorClipboard(description);
    toast.success(t('timelineCopiedItem', { item: description }), SUCCESS_TOAST_DURATION_MS, undefined, {
      leadingIcon: 'copy',
      preview: timelineClipboardPreview(item),
    });
  };
  const reportPasteError = (message: string) =>
    toast.error(t('timelinePasteFailed', { message }), ERROR_TOAST_DURATION_MS);
  const reportPasteSuccess = (highlight: Omit<TimelinePasteHighlight, 'timestamp'>, item: TimelineClipboardItem) => {
    recentPaste.value = { ...highlight, timestamp: Date.now() };
    if (recentPasteTimer) clearTimeout(recentPasteTimer);
    recentPasteTimer = setTimeout(() => {
      recentPaste.value = null;
      recentPasteTimer = null;
    }, PASTE_HIGHLIGHT_DURATION_MS);
    toast.success(
      t('timelinePastedItem', { item: describeItem(item.descriptor) }),
      SUCCESS_TOAST_DURATION_MS,
      undefined,
      { leadingIcon: 'paste', preview: timelineClipboardPreview(item) },
    );
  };

  onBeforeUnmount(() => {
    if (recentPasteTimer) clearTimeout(recentPasteTimer);
  });

  return { recentPaste, reportCopySuccess, reportPasteError, reportPasteSuccess };
};
