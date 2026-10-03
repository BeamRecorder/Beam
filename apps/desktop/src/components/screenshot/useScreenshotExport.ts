import { capture } from '~/api/capture';
import type { ScreenshotExportHost } from './screenshot-export-types';

export function useScreenshotExport(host: ScreenshotExportHost) {
  return async (copy: boolean) => {
    if (!host.document.value || !host.state.value || host.busy.value) return;
    host.finishText();
    host.busy.value = true;
    host.error.value = '';
    host.copied.value = false;
    try {
      await host.save();
      const snapshot = JSON.parse(JSON.stringify(host.state.value)) as typeof host.state.value;
      const format = copy ? 'png' : snapshot.format;
      const bytes = await host.encode(host.document.value.source, { ...snapshot, format });
      await capture.exportScreenshot(host.document.value.id, bytes, format, copy);
      host.copied.value = copy;
      if (copy) host.copiedToast();
    } catch (reason) {
      host.fail(reason);
    } finally {
      host.busy.value = false;
    }
  };
}
