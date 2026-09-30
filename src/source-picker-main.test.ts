import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createApp: vi.fn(),
  use: vi.fn(),
  mount: vi.fn(),
  appearance: vi.fn(),
  locale: vi.fn(),
  zoom: vi.fn(),
}));
vi.mock('vue', async (original) => ({ ...(await original<typeof import('vue')>()), createApp: state.createApp }));
vi.mock('pinia', () => ({ createPinia: () => ({ id: 'pinia' }) }));
vi.mock('./components/hud/source-picker/SourcePickerApp.vue', () => ({ default: { name: 'SourcePickerApp' } }));
vi.mock('./components/hud/source-picker/development-sources', () => ({ developmentSources: ['fixture'] }));
vi.mock('./window-bootstrap', () => ({ prepareWindowAppearance: state.appearance }));
vi.mock('./i18n', () => ({ initI18n: state.locale }));
vi.mock('./utils/browserZoomGuard', () => ({ installBrowserZoomGuard: state.zoom }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete window.capture;
  window.history.replaceState(null, '', '/html/source-picker.html');
  document.body.innerHTML = '<div id="app"></div>';
  document.documentElement.classList.remove('dark');
  state.createApp.mockReturnValue({ use: state.use, mount: state.mount });
  state.appearance.mockResolvedValue({ locale: 'fr' });
  state.locale.mockResolvedValue({ locale: 'fr' });
});

describe('source picker window bootstrap', () => {
  it('uses shared appearance hydration for a real Electron window', async () => {
    Object.defineProperty(window, 'capture', { configurable: true, value: {} });
    await import('./source-picker-main');
    expect(state.appearance).toHaveBeenCalledWith({ id: 'pinia' });
    expect(state.locale).not.toHaveBeenCalled();
    expect(state.createApp).toHaveBeenCalledWith({ name: 'SourcePickerApp' }, { initialSources: undefined });
    expect(state.use).toHaveBeenCalledTimes(2);
    expect(state.mount).toHaveBeenCalledWith('#app');
    expect(state.zoom).toHaveBeenCalledOnce();
  });

  it('waits for appearance before mounting the native selection surface', async () => {
    Object.defineProperty(window, 'capture', { configurable: true, value: {} });
    let complete!: (value: object) => void;
    state.appearance.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const loading = import('./source-picker-main');
    await vi.waitFor(() => expect(state.appearance).toHaveBeenCalledOnce(), { timeout: 5000 });
    expect(state.mount).not.toHaveBeenCalled();
    complete({ locale: 'fr' });
    await loading;
    expect(state.mount).toHaveBeenCalledOnce();
  });

  it('leaves an appearance failure unmounted for the native presentation gate', async () => {
    Object.defineProperty(window, 'capture', { configurable: true, value: {} });
    state.appearance.mockRejectedValue(new Error('appearance unavailable'));
    await expect(import('./source-picker-main')).rejects.toThrow('appearance unavailable');
    expect(state.mount).not.toHaveBeenCalled();
  });

  it('keeps browser development previews independent of the Electron bridge', async () => {
    window.history.replaceState(null, '', '/html/source-picker.html?preview=1');
    await import('./source-picker-main');
    expect(state.appearance).not.toHaveBeenCalled();
    expect(state.locale).toHaveBeenCalledOnce();
    expect(state.createApp).toHaveBeenCalledWith({ name: 'SourcePickerApp' }, { initialSources: ['fixture'] });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(state.mount).toHaveBeenCalledOnce();
  });

  it('shows the existing bridge error without mounting a normal browser route', async () => {
    await import('./source-picker-main');
    expect(document.getElementById('app')!.textContent).toBe('Source selection requires the Electron capture bridge.');
    expect(state.createApp).not.toHaveBeenCalled();
    expect(state.appearance).not.toHaveBeenCalled();
  });
});
