import { runScreenshotExport } from './screenshot-export-worker';
import type { ScreenshotExportRequest } from './screenshot-export-types';

self.onmessage = (event: MessageEvent<ScreenshotExportRequest>) => {
  void runScreenshotExport(event.data, (reply, transfer) => self.postMessage(reply, { transfer }));
};
