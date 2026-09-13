import { flushPromises } from '@vue/test-utils';
import type { App } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '../src/api/types/capture-api';

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => () => {}),
  reportEditorLoadingStage: vi.fn(),
  updatePreferences: vi.fn(),
}));
vi.mock('../src/api/capture', () => ({ capture }));
vi.mock('../src/components/video-editor/EditorWindowApp.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@vueuse/motion', () => ({ MotionPlugin: { install() {} } }));

const preferences = (theme: PreferenceSettings['theme']): PreferenceSettings => ({
  schemaVersion: 3,
  theme,
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark', 'editor-window-root');
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  (document.getElementById('app') as HTMLElement & { __vue_app__?: App }).__vue_app__?.unmount();
  document.documentElement.classList.remove('dark', 'editor-window-root');
  vi.restoreAllMocks();
});

describe('editor appearance bootstrap', () => {
  it('keeps the native backing until dark appearance is ready, using one preference request', async () => {
    let resolve!: (value: PreferenceSettings) => void;
    capture.getPreferences.mockReturnValue(
      new Promise<PreferenceSettings>((done) => {
        resolve = done;
      }),
    );
    await import('../src/editor-main');
    expect(capture.reportEditorLoadingStage).toHaveBeenCalledWith('loadingAppearance');
    expect(capture.reportEditorLoadingStage).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains('editor-window-root')).toBe(false);
    expect(document.querySelector('#app')?.childElementCount).toBe(0);
    resolve(preferences('dark'));
    await flushPromises();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('editor-window-root')).toBe(true);
    expect(document.querySelector('#app')?.childElementCount).toBe(1);
    expect(capture.getPreferences).toHaveBeenCalledOnce();
  });

  it('applies light preferences before making the editor opaque', async () => {
    document.documentElement.classList.add('dark');
    capture.getPreferences.mockResolvedValue(preferences('light'));
    await import('../src/editor-main');
    await flushPromises();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('editor-window-root')).toBe(true);
  });

  it('resolves the system theme through the same store that owns subsequent theme changes', async () => {
    const original = window.matchMedia('(prefers-color-scheme: dark)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...original, matches: true });
    capture.getPreferences.mockResolvedValue(preferences('system'));
    await import('../src/editor-main');
    await flushPromises();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('editor-window-root')).toBe(true);
  });

  it('still mounts with the store default if preference loading fails', async () => {
    capture.getPreferences.mockRejectedValue(new Error('Unavailable'));
    await import('../src/editor-main');
    await flushPromises();
    expect(document.querySelector('#app')?.childElementCount).toBe(1);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('editor-window-root')).toBe(true);
  });
});
