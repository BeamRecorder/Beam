import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => {
  const deferred = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise<unknown>((complete) => {
      resolve = complete;
    });
    return { promise, resolve };
  };
  return {
    deferred,
    locale: deferred(),
    theme: deferred(),
    content: deferred(),
    createApp: vi.fn(),
    mount: vi.fn(),
    use: vi.fn(),
    initI18n: vi.fn(),
    load: vi.fn(),
    themeStore: vi.fn(),
  };
});
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  createApp: state.createApp,
}));
vi.mock('pinia', () => ({ createPinia: () => ({ id: 'pinia' }) }));
vi.mock('./components/desktop/HudPanelApp.vue', () => ({
  default: { name: 'HudPanelApp' },
}));
vi.mock('./components/desktop/hud-panel-content', () => ({
  readHudPanel: () => 'projects',
  loadHudPanelContent: state.load,
}));
vi.mock('./stores/theme', () => ({ useThemeStore: state.themeStore }));
vi.mock('./i18n', () => ({ initI18n: state.initI18n }));
vi.mock('./utils/browserZoomGuard', () => ({
  installBrowserZoomGuard: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.locale = state.deferred();
  state.theme = state.deferred();
  state.content = state.deferred();
  state.createApp.mockReturnValue({ use: state.use, mount: state.mount });
  state.initI18n.mockImplementation(() => state.locale.promise);
  state.load.mockImplementation(() => state.content.promise);
  state.themeStore.mockImplementation(() => ({ ready: state.theme.promise }));
});
describe('HUD panel parallel bootstrap', () => {
  it.each(['locale', 'theme', 'content'] as const)(
    'starts every dependency together and waits for %s',
    async (pending) => {
      const loading = import('./hud-panel-main');
      await vi.waitFor(() => expect(state.themeStore).toHaveBeenCalledOnce(), {
        timeout: 5000,
      });
      expect(state.initI18n).toHaveBeenCalledOnce();
      expect(state.load).toHaveBeenCalledWith('projects');
      for (const name of ['locale', 'theme', 'content'] as const) {
        if (name !== pending) state[name].resolve(undefined);
      }
      await Promise.resolve();
      expect(state.mount).not.toHaveBeenCalled();
      state[pending].resolve(undefined);
      await loading;
      expect(state.createApp).toHaveBeenCalledWith(expect.anything(), {
        panel: 'projects',
        content: undefined,
      });
      expect(state.use).toHaveBeenCalledTimes(2);
      expect(state.mount).toHaveBeenCalledWith('#app');
      expect(document.documentElement.classList.contains('editor-window-root')).toBe(true);
    },
  );
});
