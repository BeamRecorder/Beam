import { describe, expect, it, vi } from 'vitest';
import { loadRecorderWindow } from './recorder-window-loader';
vi.mock('./overlay-main', () => ({ role: 'overlay' }));
vi.mock('./main', () => ({ role: 'hud' }));

describe('recorder window module selection', () => {
  it.each([
    '?cameraOverlay=1',
    '?quickSnipCrop=1',
    '?cameraOverlay=0&quickSnipCrop=1',
    '?quickSnipSettings=1',
    '?capturePreparationSettings=1',
  ])('loads only the overlay bootstrap for %s', async (search) => {
    expect(await loadRecorderWindow(search)).toEqual({ role: 'overlay' });
  });
  it.each(['', '?unknown=1', '?search=cameraOverlay', '?notquickSnipCrop=1'])(
    'loads the HUD for %s',
    async (search) => {
      expect(await loadRecorderWindow(search)).toEqual({ role: 'hud' });
    },
  );
});
