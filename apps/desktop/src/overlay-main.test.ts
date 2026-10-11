import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  createApp: vi.fn(),
  use: vi.fn(),
  mount: vi.fn(),
  appearance: vi.fn(),
  camera: vi.fn(),
  crop: vi.fn(),
  settings: vi.fn(),
  locale: vi.fn(),
  complete: vi.fn(),
  zoom: vi.fn(),
}));
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  createApp: state.createApp,
}));
vi.mock('pinia', () => ({ createPinia: () => ({ id: 'pinia' }) }));
vi.mock('./components/desktop/OverlayWindowApp.vue', () => ({
  default: { name: 'OverlayWindowApp' },
}));
vi.mock('./components/hud/camera/CameraOverlayApp.vue', () => {
  state.camera();
  return { default: { name: 'CameraOverlayApp' } };
});
vi.mock('./components/quick-snip/QuickSnipCropBar.vue', () => {
  state.crop();
  return { default: { name: 'QuickSnipCropBar' } };
});
vi.mock('./components/quick-snip/QuickSnipSettings.vue', () => {
  state.settings();
  return { default: { name: 'QuickSnipSettings' } };
});
vi.mock('./window-bootstrap', () => ({
  prepareWindowAppearance: state.appearance,
}));
vi.mock('./stores/locale', () => ({ useLocaleStore: state.locale }));
vi.mock('./recorder-startup', () => ({
  completeRecorderStartup: state.complete,
}));
vi.mock('./utils/browserZoomGuard', () => ({
  installBrowserZoomGuard: state.zoom,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.createApp.mockReturnValue({ use: state.use, mount: state.mount });
  state.appearance.mockResolvedValue({ locale: 'fr' });
});
describe('overlay window bootstrap', () => {
  it.each([
    ['cameraOverlay', 'CameraOverlayApp', 'camera', 'crop'],
    ['quickSnipCrop', 'QuickSnipCropBar', 'crop', 'camera'],
    ['quickSnipSettings', 'QuickSnipSettings', 'settings', 'camera'],
  ] as const)('mounts only %s with the shared locale and theme', async (query, component, loaded, omitted) => {
    window.history.replaceState(null, '', `/?${query}=1`);
    await import('./overlay-main');
    expect(state[loaded]).toHaveBeenCalledOnce();
    expect(state[omitted]).not.toHaveBeenCalled();
    expect(state.createApp).toHaveBeenCalledWith(expect.anything(), {
      content: { name: component },
    });
    expect(state.use).toHaveBeenCalledTimes(2);
    expect(state.locale).toHaveBeenCalledWith({ id: 'pinia' });
    expect(state.mount).toHaveBeenCalledWith('#app');
    expect(state.complete).toHaveBeenCalledOnce();
    expect(state.zoom).toHaveBeenCalledOnce();
  });
  it('gives Quick Snip settings precedence when both overlay flags are present', async () => {
    window.history.replaceState(null, '', '/?cameraOverlay=1&quickSnipSettings=1');
    await import('./overlay-main');
    expect(state.createApp).toHaveBeenCalledWith(expect.anything(), {
      content: { name: 'QuickSnipSettings' },
    });
  });
  it('loads overlay content while appearance is pending and mounts after both are ready', async () => {
    window.history.replaceState(null, '', '/?cameraOverlay=1');
    let resolve!: (value: object) => void;
    state.appearance.mockReturnValue(
      new Promise((complete) => {
        resolve = complete;
      }),
    );
    const loading = import('./overlay-main');
    await vi.waitFor(() => expect(state.appearance).toHaveBeenCalledOnce(), {
      timeout: 5000,
    });
    expect(state.mount).not.toHaveBeenCalled();
    resolve({ locale: 'fr' });
    await loading;
    expect(state.mount).toHaveBeenCalledOnce();
  });
  it('does not mount or announce readiness when appearance fails', async () => {
    window.history.replaceState(null, '', '/?quickSnipCrop=1');
    state.appearance.mockRejectedValue(new Error('appearance unavailable'));
    await expect(import('./overlay-main')).rejects.toThrow('appearance unavailable');
    expect(state.mount).not.toHaveBeenCalled();
    expect(state.complete).not.toHaveBeenCalled();
  });
});
