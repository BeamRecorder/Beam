import type { ScreenshotExportReport } from './screenshot-export-diagnostics-types';
import type { ToastPreview } from '~/ui/toast/toastStore';
import { useToastStore } from '~/ui/toast/toastStore';
import { useTranslate } from '~/i18n/useTranslate';

export function useScreenshotExportToast() {
  const toast = useToastStore();
  const { t } = useTranslate('ScreenshotEditor');
  return (report: ScreenshotExportReport, src?: string) => {
    if (report.status === 'cancelled') return;
    const success = report.status === 'success';
    const message = t(
      success
        ? report.operation === 'copy'
          ? 'copiedToast'
          : 'exportedToast'
        : report.operation === 'copy'
          ? 'copyFailedToast'
          : 'exportFailedToast',
    );
    const preview: ToastPreview | undefined = src
      ? { kind: 'image', src, alt: message, status: success ? 'success' : 'error' }
      : undefined;
    const action = {
      label: t('copyTimingReport'),
      copyText: JSON.stringify(report, null, 2),
      dismissOnSuccess: false,
      ...(report.error ? { detail: report.error } : {}),
    };
    if (success) toast.success(message, 5000, action, { preview });
    else toast.error(message, 8000, action, { preview });
  };
}
