import { beforeEach, expect, it, vi } from 'vitest';
import type { ScreenshotExportReport } from '../screenshot-export-diagnostics-types';
import { useScreenshotExportToast } from '../screenshot-export-toast';
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => toast }));
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
const report = (patch: Partial<ScreenshotExportReport> = {}): ScreenshotExportReport => ({
  operation: 'copy',
  status: 'success',
  projectId: 'id',
  width: 1920,
  height: 1080,
  format: 'png',
  bytes: 123,
  cacheHit: false,
  totalMs: 50,
  timings: { 'worker.render': 12 },
  ...patch,
});
beforeEach(() => vi.clearAllMocks());
it.each([['copy', 'copiedToast']] as const)(
  'confirms %s with its output preview and a copyable report',
  (operation, message) => {
    const result = report({ operation });
    useScreenshotExportToast()(result, 'data:image/png;base64,preview');
    expect(toast.success).toHaveBeenCalledWith(
      message,
      5000,
      { label: 'copyTimingReport', copyText: JSON.stringify(result, null, 2), dismissOnSuccess: false },
      { preview: { kind: 'image', src: 'data:image/png;base64,preview', alt: message, status: 'success' } },
    );
  },
);
it.each([['copy', 'copyFailedToast']] as const)(
  'reports %s failure with a red output badge and the error details',
  (operation, message) => {
    const result = report({ operation, status: 'error', error: 'Denied' });
    useScreenshotExportToast()(result, 'preview');
    expect(toast.error).toHaveBeenCalledWith(
      message,
      8000,
      expect.objectContaining({ detail: 'Denied', dismissOnSuccess: false }),
      { preview: expect.objectContaining({ status: 'error' }) },
    );
  },
);
it('handles failures before rendering without inventing an output thumbnail', () => {
  useScreenshotExportToast()(report({ status: 'error' }));
  expect(toast.error).toHaveBeenCalledWith('copyFailedToast', 8000, expect.any(Object), { preview: undefined });
});
it('skips completion feedback when the save dialog was cancelled', () => {
  useScreenshotExportToast()(report({ status: 'cancelled' }), 'preview');
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});

it.each(['success', 'error'] as const)('leaves %s export feedback to the persistent pill', (status) => {
  useScreenshotExportToast()(report({ operation: 'export', status }), 'preview');
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});
