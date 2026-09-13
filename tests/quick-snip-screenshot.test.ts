import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import type { ScreenshotEncodeOptions } from '~/components/video-editor/screenshot/screenshot-types';
const mocks = vi.hoisted(() => ({
  capture: {
    prepareRecordingSurface: vi.fn(),
    captureScreenshot: vi.fn(),
    reportQuickSnip: vi.fn(),
    listBackgroundLibrary: vi.fn(),
    saveScreenshot: vi.fn(),
    exportScreenshot: vi.fn(),
  },
  screenshotState: vi.fn(),
  encodeScreenshot: vi.fn(),
  screenshotPreview: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/components/video-editor/screenshot/screenshot-state', () => ({ screenshotState: mocks.screenshotState }));
vi.mock('~/components/video-editor/screenshot/screenshot-render', () => ({
  encodeScreenshot: mocks.encodeScreenshot,
  screenshotPreview: mocks.screenshotPreview,
}));
import { captureQuickScreenshot } from '~/components/quick-snip/quick-snip-screenshot';
const configuration = {
  name: 'Screenshot 1',
  mode: 'screenshot',
  screenshotAction: 'copy',
  screenKind: 'display',
  screenId: 'display-2',
  region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
  excludedWindowHandle: 'abc',
} as QuickSnipConfiguration;
const document = { id: 'still-1', source: 'project-media://screenshot/still-1/source.png' };
const state = { format: 'webp', canvas: { width: 1920, height: 1080 } };
const rendered = {} as OffscreenCanvas;
const bytes = new ArrayBuffer(4);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.capture.captureScreenshot.mockResolvedValue(document);
  mocks.capture.listBackgroundLibrary.mockResolvedValue([]);
  mocks.screenshotState.mockReturnValue(state);
  mocks.screenshotPreview.mockResolvedValue('data:image/jpeg;base64,AA==');
  mocks.encodeScreenshot.mockImplementation(
    async (_source: string, _state: unknown, options: ScreenshotEncodeOptions) => {
      await options.onRendered?.(rendered);
      return bytes;
    },
  );
});
describe('Quick screenshot pipeline', () => {
  it('publishes processing and a styled thumbnail before copying the PNG', async () => {
    await captureQuickScreenshot(configuration, () => true);
    expect(mocks.capture.captureScreenshot).toHaveBeenCalledWith({
      screenKind: 'display',
      screenId: 'display-2',
      region: configuration.region,
      excludedWindowHandles: ['abc'],
    });
    expect(mocks.capture.reportQuickSnip.mock.calls.map(([event]) => event)).toEqual([
      { type: 'screenshot-captured', name: configuration.name, screenshotId: document.id },
      { type: 'screenshot-rendered', name: configuration.name, preview: 'data:image/jpeg;base64,AA==' },
      { type: 'screenshot', name: configuration.name, screenshotId: document.id },
    ]);
    expect(mocks.encodeScreenshot).toHaveBeenCalledWith(
      document.source,
      { ...state, format: 'png' },
      expect.any(Object),
    );
    expect(mocks.capture.reportQuickSnip.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capture.listBackgroundLibrary.mock.invocationCallOrder[0]!,
    );
    expect(mocks.screenshotPreview).toHaveBeenCalledWith(rendered);
    expect(mocks.capture.reportQuickSnip.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.capture.exportScreenshot.mock.invocationCallOrder[0]!,
    );
    expect(mocks.capture.exportScreenshot).toHaveBeenCalledWith(document.id, bytes, 'png', true);
  });

  it('returns Portal cancellation to the bar without processing or copying', async () => {
    mocks.capture.captureScreenshot.mockResolvedValue(null);
    await captureQuickScreenshot({ ...configuration, region: null, excludedWindowHandle: undefined }, () => true);
    expect(mocks.capture.captureScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ region: null, excludedWindowHandles: [] }),
    );
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledExactlyOnceWith({
      type: 'capture-cancelled',
      name: configuration.name,
    });
    expect(mocks.encodeScreenshot).not.toHaveBeenCalled();
  });

  it('opens an editable screenshot without background loading or clipboard encoding', async () => {
    await captureQuickScreenshot({ ...configuration, screenshotAction: 'edit' }, () => true);
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledExactlyOnceWith({
      type: 'screenshot',
      name: configuration.name,
      screenshotId: document.id,
    });
    expect(mocks.capture.listBackgroundLibrary).not.toHaveBeenCalled();
    expect(mocks.capture.exportScreenshot).not.toHaveBeenCalled();
  });

  it.each(['prepareRecordingSurface', 'captureScreenshot', 'listBackgroundLibrary', 'saveScreenshot'] as const)(
    'stops after cancellation during %s',
    async (operation) => {
      let current = true;
      mocks.capture[operation].mockImplementationOnce(async () => {
        current = false;
        return document;
      });
      await captureQuickScreenshot(configuration, () => current);
      expect(mocks.capture.exportScreenshot).not.toHaveBeenCalled();
      expect(mocks.capture.reportQuickSnip.mock.calls.some(([event]) => event.type === 'screenshot')).toBe(false);
    },
  );

  it('discards a late thumbnail and encoded result after cancellation', async () => {
    let current = true;
    mocks.screenshotPreview.mockImplementation(async () => {
      current = false;
      return 'data:image/jpeg;base64,AA==';
    });
    await captureQuickScreenshot(configuration, () => current);
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledTimes(1);
    expect(mocks.capture.exportScreenshot).not.toHaveBeenCalled();
  });

  it('does not complete an obsolete job after clipboard response', async () => {
    let current = true;
    mocks.capture.exportScreenshot.mockImplementation(async () => {
      current = false;
    });
    await captureQuickScreenshot(configuration, () => current);
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledTimes(2);
  });

  it('propagates a clipboard failure without claiming completion', async () => {
    mocks.capture.exportScreenshot.mockRejectedValue(new Error('clipboard unavailable'));
    await expect(captureQuickScreenshot(configuration, () => true)).rejects.toThrow('clipboard unavailable');
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledTimes(2);
  });
});
