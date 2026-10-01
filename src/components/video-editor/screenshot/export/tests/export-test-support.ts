import { vi } from 'vitest';
import { screenshotState } from '../../screenshot-state';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotExportRequest } from '../screenshot-export-types';

export const stateFixture = (): ScreenshotState => {
  const state = screenshotState({
    id: 'screen',
    name: 'Test',
    source: 'source.png',
    width: 1000,
    height: 500,
    state: null,
    preset: {
      editor: { schemaVersion: 1 },
      devices: {},
      export: { format: 'png', quality: 0.9, resolution: '1080p' },
      quickSnip: { automaticZoom: false },
    },
  });
  state.canvas.showBackground = false;
  state.canvas.watermark!.enabled = false;
  state.image.transform = { x: 0, y: 0, width: 1, height: 1 };
  state.image.appearance.shadowSize = 'none';
  return state;
};
export const bitmap = (width = 1000, height = 500) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;
export const requestFixture = (): ScreenshotExportRequest => ({
  source: 'source.png',
  state: stateFixture(),
  decorations: { logo: null },
});
