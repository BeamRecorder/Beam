import { capture } from '~/api/capture';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import { screenshotState } from '../video-editor/screenshot/screenshot-state';
import { encodeScreenshot, screenshotPreview } from '../video-editor/screenshot/screenshot-render';

export async function captureQuickScreenshot(current: QuickSnipConfiguration, isCurrent: () => boolean) {
  await capture.prepareRecordingSurface();
  if (!isCurrent()) return;
  const document = await capture.captureScreenshot({
    screenKind: current.screenKind,
    screenId: current.screenId,
    region: current.region ? { ...current.region } : null,
    excludedWindowHandles: current.excludedWindowHandle ? [current.excludedWindowHandle] : [],
  });
  if (!isCurrent()) return;
  if (document === null) {
    await capture.reportQuickSnip({ type: 'capture-cancelled', name: current.name });
    return;
  }
  if (current.screenshotAction !== 'edit') {
    await capture.reportQuickSnip({ type: 'screenshot-captured', name: current.name, screenshotId: document.id });
    const backgrounds = await capture.listBackgroundLibrary();
    if (!isCurrent()) return;
    const state = screenshotState(document, backgrounds);
    await capture.saveScreenshot(document.id, state);
    if (!isCurrent()) return;
    const bytes = await encodeScreenshot(
      document.source,
      { ...state, format: 'png' },
      {
        onRendered: async (canvas) => {
          const preview = await screenshotPreview(canvas);
          if (isCurrent()) await capture.reportQuickSnip({ type: 'screenshot-rendered', name: current.name, preview });
        },
      },
    );
    if (!isCurrent()) return;
    await capture.exportScreenshot(document.id, bytes, 'png', true);
  }
  if (isCurrent()) await capture.reportQuickSnip({ type: 'screenshot', name: current.name, screenshotId: document.id });
}
