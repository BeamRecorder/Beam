import { defineComponent, computed } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureMock as capture } from './capture.mock';
import { browserCameraMock } from './camera-recorder.mock';
import { browserMicrophoneMock } from './microphone-recorder.mock';
import { useHudState } from '../useHudState';
import type { HudProps } from '../hud-state-types';
import type { CaptureCatalog, PreferenceSettings } from '~/api/types/capture-api';

vi.mock('../../../api/capture', async () => ({
  capture: (await import('./capture.mock')).captureMock,
}));
vi.mock('../../../api/camera-recorder', async () => import('./camera-recorder.mock'));
vi.mock('../../../api/microphone-recorder', async () => import('./microphone-recorder.mock'));
vi.mock('../audio/useAudioLevelMeter', () => ({
  useAudioLevelMeter: (enabled: { value: boolean }) => ({
    level: computed(() => (enabled.value ? 1 : 0)),
  }),
}));
vi.mock('../recorder/useNativeSystemAudioPreview', () => ({
  useNativeSystemAudioPreview: (enabled: { value: boolean }) => ({
    level: computed(() => (enabled.value ? 1 : 0)),
  }),
}));

const catalog = {
  sources: [{ id: 'display:1', kind: 'display', label: 'Screen', isDefault: true }],
  capabilities: {},
};
let wrapper: VueWrapper | undefined;
const emit = vi.fn();
function mountState(overrides: Partial<HudProps> = {}) {
  let state!: ReturnType<typeof useHudState>;
  wrapper = mount(
    defineComponent({
      setup() {
        state = useHudState(
          {
            embedded: false,
            showTopbar: true,
            preparingEditor: false,
            editorLoadingProgress: { stage: 'openingWindow', value: 10 },
            ...overrides,
          },
          emit,
        );
        return () => null;
      },
    }),
  );
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  capture.platform = 'win32';
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: capture,
  });
  capture.updatePreferences.mockResolvedValue({});
  capture.getDisplayBounds.mockResolvedValue(null);
  capture.openHudSettings.mockResolvedValue(true);
  capture.openHudProjects.mockResolvedValue(true);
  capture.getPreferences.mockResolvedValue({
    schemaVersion: 3,
    theme: 'dark',
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: false, noticeDismissed: true },
    alwaysOnTop: true,
    devices: {
      cameraId: 'camera:1',
      micId: 'microphone:1',
      systemAudioMode: 'on',
    },
    shortcuts: {},
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  });
  capture.getSources.mockResolvedValue([]);
  capture.discover.mockResolvedValue(catalog);
  browserCameraMock.listBrowserCameras.mockResolvedValue([{ id: 'camera:1', kind: 'camera', label: 'Camera' }]);
  browserMicrophoneMock.listBrowserMicrophones.mockResolvedValue([
    { id: 'microphone:1', kind: 'microphone', label: 'Mic' },
  ]);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  delete window.capture;
});

describe('HUD startup', () => {
  it('restores browser devices and subscribes to controls while native discovery is pending', async () => {
    let resolveCatalog!: (value: typeof catalog) => void;
    capture.discover.mockReturnValue(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    const state = mountState();
    expect(state.isBusy.value).toBe(true);
    await flushPromises();
    expect(state.selectedCameraId.value).toBe('camera:1');
    expect(state.selectedMicId.value).toBe('microphone:1');
    expect(capture.configureCameraOverlay).toHaveBeenLastCalledWith({
      cameraId: 'camera:1',
    });
    expect(capture.onPreferenceShortcut).toHaveBeenCalled();
    expect(state.isBusy.value).toBe(true);
    resolveCatalog(catalog);
    await flushPromises();
    expect(state.selectedScreenId.value).toBe('display:1');
    expect(state.cameraOptions.value.some((option) => option.value === 'camera:1')).toBe(true);
    expect(state.isBusy.value).toBe(false);
    expect(capture.getSources).toHaveBeenCalledExactlyOnceWith(['screen']);
  });

  it('keeps native screen selection available when browser device discovery fails', async () => {
    browserCameraMock.listBrowserCameras.mockRejectedValue(new Error('camera service unavailable'));
    const state = mountState();
    await flushPromises();
    expect(state.selectedScreenId.value).toBe('display:1');
    expect(state.sourceDiscoveryCompleted.value).toBe(true);
    expect(state.isBusy.value).toBe(false);
    expect(state.hudIssues.value.length).toBeGreaterThan(0);
  });

  it('does not start preview refreshes after unmount during discovery', async () => {
    let resolveCatalog!: (value: typeof catalog) => void;
    capture.discover.mockReturnValue(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    mountState();
    await flushPromises();
    wrapper?.unmount();
    wrapper = undefined;
    resolveCatalog(catalog);
    await flushPromises();
    expect(capture.getSources).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('HUD coordination boundaries', () => {
  it('does not start recording while busy and routes start/stop shortcuts to its owner', async () => {
    const state = mountState();
    await state.toggleRecording();
    expect(emit).not.toHaveBeenCalled();
    await flushPromises();
    const listener = capture.onPreferenceShortcut.mock.calls[0]![0];
    listener('unrelated');
    expect(emit).not.toHaveBeenCalled();
    listener('hud.startStopRecording');
    await flushPromises();
    expect(emit).toHaveBeenCalledWith('start-recording', expect.objectContaining({ screenId: 'display:1' }));
    state.isRecording.value = true;
    listener('hud.startStopRecording');
    await flushPromises();
    expect(emit).toHaveBeenLastCalledWith('stop-recording');
  });
  it('rejects missing screen and window selections instead of sending an empty capture', async () => {
    capture.discover.mockResolvedValue({ sources: [], capabilities: {} });
    const state = mountState();
    await flushPromises();
    expect(state.selectedScreenBounds.value).toBeNull();
    expect(state.displaySources.value).toEqual([]);
    await state.toggleRecording();
    expect(state.hudIssues.value[0]?.details.join()).toContain('screen');
    state.activeTab.value = 'window';
    await flushPromises();
    await state.toggleRecording();
    expect(state.hudIssues.value[0]?.details.join()).toContain('window');
    expect(emit).not.toHaveBeenCalled();
  });
  it.each(['win32', 'darwin', 'linux'])(
    'selects the launcher source on %s and dismisses only outside open menus',
    async (platform) => {
      capture.platform = platform;
      capture.discover.mockResolvedValue({
        sources: [
          ...catalog.sources,
          platform === 'linux'
            ? {
                id: 'portal:window',
                kind: 'window',
                label: 'Window',
                selectionMode: 'portal',
                isDefault: true,
              }
            : {
                id: platform === 'darwin' ? 'sck:window:123' : 'window:123:0',
                kind: 'window',
                label: 'Window',
              },
        ],
        capabilities: {},
      });
      capture.getSources.mockResolvedValue([{ id: 'window:123:0', name: 'Window', thumbnail: '', appIcon: null }]);
      const state = mountState({
        recorderLauncherContext: {
          preferredKind: 'window',
          preferredSourceId: 'window:123:0',
          requestId: 'request:1',
        },
      });
      await flushPromises();
      expect(state.activeTab.value).toBe('window');
      expect(state.selectedSourceId.value).toBe(
        platform === 'linux' ? 'portal:window' : platform === 'darwin' ? 'sck:window:123' : 'window:123:0',
      );
      state.handleDropdownToggle(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(emit).not.toHaveBeenCalled();
      state.handleDropdownToggle(false);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(emit).not.toHaveBeenCalled();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(emit).toHaveBeenLastCalledWith('dismiss-launcher');
      state.closeApp();
      state.minimizeApp();
      expect(capture.close).not.toHaveBeenCalled();
      expect(capture.minimize).not.toHaveBeenCalled();
    },
  );
  it('keeps embedded surfaces free of native settings, camera and teleprompter operations', async () => {
    const state = mountState({ embedded: true });
    await flushPromises();
    state.toggleTeleprompter();
    state.closeApp();
    state.minimizeApp();
    await state.openPanel('settings');
    await state.openPanel('projects');
    state.selectedCameraId.value = 'camera:1';
    state.selectedMicId.value = 'microphone:1';
    await flushPromises();
    expect(capture.getPreferences).not.toHaveBeenCalled();
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    expect(capture.configureCameraOverlay).not.toHaveBeenCalled();
    expect(capture.showTeleprompter).not.toHaveBeenCalled();
    expect(capture.close).not.toHaveBeenCalled();
    expect(capture.minimize).not.toHaveBeenCalled();
    expect(capture.openHudSettings).not.toHaveBeenCalled();
    expect(state.micLevel.value).toBe(0);
    expect(state.systemAudioLevel.value).toBe(0);
  });
  it('handles normal close, minimize animation and teleprompter visibility notifications', async () => {
    const state = mountState();
    await flushPromises();
    state.closeApp();
    expect(capture.close).toHaveBeenCalledOnce();
    state.minimizeApp();
    expect(document.body.classList.contains('app-minimizing')).toBe(true);
    await vi.advanceTimersByTimeAsync(160);
    expect(capture.minimize).toHaveBeenCalledOnce();
    expect(document.body.classList.contains('app-minimizing')).toBe(false);
    state.toggleTeleprompter();
    expect(capture.showTeleprompter).toHaveBeenCalledOnce();
    state.toggleTeleprompter();
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce();
    const listener = capture.onTeleprompterVisibility.mock.calls[0]![0];
    listener(true);
    expect(state.isTeleprompterVisible.value).toBe(true);
  });
  it('keeps camera notifications for other devices from invalidating the selected camera', async () => {
    const state = mountState();
    await flushPromises();
    const listener = capture.onCameraOverlayState.mock.calls[0]![0];
    listener({ cameraId: 'camera:2' });
    expect(state.selectedCameraId.value).toBe('camera:1');
    state.selectedCameraId.value = 'off';
    listener({ cameraId: 'off' });
    expect(state.hudIssues.value).toEqual([]);
  });
  it('does not restart discovery after preferences resolve on a disposed HUD', async () => {
    let resolve!: (preferences: PreferenceSettings) => void;
    capture.getPreferences.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    mountState();
    wrapper?.unmount();
    wrapper = undefined;
    resolve({ devices: {}, extras: {} } as PreferenceSettings);
    await flushPromises();
    expect(capture.discover).not.toHaveBeenCalled();
    expect(capture.onPreferenceShortcut).not.toHaveBeenCalled();
  });
  it.each([
    { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    { x: -0.1, y: 0, width: 0.3, height: 0.4 },
    { x: 0, y: -0.1, width: 0.3, height: 0.4 },
    { x: 0, y: 0, width: 0, height: 0.4 },
    { x: 0, y: 0, width: 0.3, height: 0 },
    { x: 0.8, y: 0, width: 0.3, height: 0.4 },
    { x: 0, y: 0.9, width: 0.3, height: 0.4 },
    { x: NaN, y: 0, width: 0.3, height: 0.4 },
    'invalid',
  ])('validates a saved region without activating a crop on startup: %j', async (screenRegion) => {
    const preferences = await capture.getPreferences();
    capture.getPreferences.mockResolvedValue({
      ...preferences,
      extras: { screenRegion },
    });
    const state = mountState();
    await flushPromises();
    expect(state.selectedScreenRegion.value).toBeNull();
    expect(capture.selectScreenRegion).not.toHaveBeenCalled();
  });
  it('reports non-Error discovery and panel failures and tolerates a missing source array', async () => {
    capture.discover.mockResolvedValue({
      sources: null,
      capabilities: {},
    } as unknown as CaptureCatalog);
    const state = mountState();
    await flushPromises();
    expect(state.displaySources.value).toEqual([]);
    capture.discover.mockRejectedValueOnce('Native service failed');
    await state.discoverSources();
    expect(state.hudIssues.value[0]?.details).toEqual(['Native service failed']);
    capture.openHudProjects.mockRejectedValueOnce('Projects failed');
    await state.openPanel('projects');
    expect(state.hudIssues.value[0]?.details).toEqual(['Projects failed']);
  });
  it('updates meter activation and native preview conditions when capture mode or recording changes', async () => {
    capture.platform = 'linux';
    const state = mountState();
    await flushPromises();
    expect(state.micLevel.value).toBe(1);
    expect(state.systemAudioLevel.value).toBe(1);
    state.isRecording.value = true;
    expect(state.systemAudioLevel.value).toBe(0);
    state.isRecording.value = false;
    state.isBusy.value = true;
    expect(state.systemAudioLevel.value).toBe(0);
    state.isBusy.value = false;
    state.systemAudioMode.value = 'off';
    expect(state.systemAudioLevel.value).toBe(0);
    state.systemAudioMode.value = 'on';
    state.selectedMicId.value = 'no-audio';
    expect(state.micLevel.value).toBe(0);
    state.selectedMicId.value = 'microphone:1';
    state.captureMode.value = 'screenshot';
    expect(state.micLevel.value).toBe(0);
    expect(state.systemAudioLevel.value).toBe(0);
  });
});
